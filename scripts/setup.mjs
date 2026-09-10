// One-time installation: generates the owner login secret, the cookie signing
// secret and the agent installation secret into .env.local, copies the
// OpenComputer key from the CLI login into it (the app reads configuration
// from the environment only), links or creates the OpenComputer project,
// uploads the agent secret, deploys both agents to Development, and prints
// how to deploy the app. It never prints the OpenComputer key.
//
//   npm run setup -- --origin https://your-app.example
//   npm run setup -- --rotate      # new owner + cookie secrets; old logins stop working
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvFile, root, writeEnvFile } from "./env-file.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function cli(args, { input, quiet = false } = {}) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("node_modules/@opencomputer/cli/dist/index.js", root)), ...args],
    {
      cwd: fileURLToPath(root),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
    if (!quiet) process.stdout.write(data);
  });
  child.stderr.on("data", (data) => {
    if (!quiet) process.stderr.write(data);
  });
  child.stdin.end(input);
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`opencomputer ${args[0]} failed (exit ${code})`)),
    );
  });
  return output;
}

const secret = (bytes) => randomBytes(bytes).toString("base64url");

try {
  const env = await readEnvFile();
  const rotate = process.argv.includes("--rotate");
  const origin = option("--origin") ?? env.OPENMUSE_APP_ORIGIN;
  if (!origin)
    throw new Error(
      "Pass --origin https://<the app's public https origin> (a tunnel for local runs, the Vercel URL for a deployment).",
    );
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.pathname !== "/")
    throw new Error("--origin must be an https origin without a path");
  env.OPENMUSE_APP_ORIGIN = url.origin;

  const generated = [];
  for (const [name, bytes] of [
    ["OPENMUSE_OWNER_SECRET", 24],
    ["OPENMUSE_COOKIE_SECRET", 32],
  ]) {
    if (!env[name] || rotate) {
      env[name] = secret(bytes);
      generated.push(name);
    }
  }
  if (!env.OPENMUSE_AGENT_SECRET) {
    env.OPENMUSE_AGENT_SECRET = secret(32);
    generated.push("OPENMUSE_AGENT_SECRET");
  }
  if (!env.OPENMUSE_INSTALLATION_ID) {
    env.OPENMUSE_INSTALLATION_ID = randomBytes(8).toString("hex");
    generated.push("OPENMUSE_INSTALLATION_ID");
  }

  const config = JSON.parse(
    await readFile(process.env.OPENCOMPUTER_CONFIG ?? join(homedir(), ".opencomputer/config.json"), "utf8"),
  );
  if (!config.apiKey) throw new Error("Run npx opencomputer login first");
  env.OPENCOMPUTER_API_URL = new URL(config.apiUrl ?? "https://app.opencomputer.dev").origin;
  env.OPENCOMPUTER_ENVIRONMENT = env.OPENCOMPUTER_ENVIRONMENT || "development";
  // The key the CLI holds becomes the app's OPENCOMPUTER_API_KEY; .env.local is
  // ignored by git and mode 600. Rotate it in the OpenComputer dashboard.
  env.OPENCOMPUTER_API_KEY = env.OPENCOMPUTER_API_KEY || config.apiKey;
  // Local runs are a long-lived process: the interim return path ticks in-process.
  env.OPENMUSE_RETURN_PATH = env.OPENMUSE_RETURN_PATH || "timer";
  await writeEnvFile(env);
  process.env.OPENMUSE_APP_ORIGIN = env.OPENMUSE_APP_ORIGIN;

  await import("./prepare-agent.mjs");
  await cli(["doctor"]);
  if (!existsSync(new URL(".opencomputer/project.json", root))) {
    await cli(["link", "--create-project", "openmuse-dev"]);
  }
  const binding = JSON.parse(await readFile(new URL(".opencomputer/project.json", root), "utf8"));
  if (new URL(binding.apiUrl).origin !== env.OPENCOMPUTER_API_URL) {
    throw new Error(`The linked project targets ${binding.apiUrl}; the CLI login targets ${env.OPENCOMPUTER_API_URL}`);
  }
  await cli(
    [
      "secrets",
      "set",
      "OPENMUSE_AGENT_SECRET",
      "--environment",
      "development",
      "--allow-origin",
      env.OPENMUSE_APP_ORIGIN,
      "--value-stdin",
    ],
    { input: env.OPENMUSE_AGENT_SECRET },
  );
  await cli(["deploy", "--alias", "development"]);

  // Cloud agent ids: the first agent in opencomputer/project.ts is the
  // project's primary agent id; the others are <primary>--<local id>.
  env.OPENCOMPUTER_PROJECT_ID = binding.projectId;
  env.OPENMUSE_COORDINATOR_AGENT = binding.agentId;
  env.OPENMUSE_WORKER_AGENT = `${binding.agentId}--topic-worker`;
  await writeEnvFile(env);

  console.log(`
Ready. Project ${binding.projectName} (${binding.projectId}); agents ${env.OPENMUSE_COORDINATOR_AGENT} and ${env.OPENMUSE_WORKER_AGENT} deployed to Development.
${generated.length ? `Generated ${generated.join(", ")} into .env.local (mode 600).` : "Kept the existing secrets in .env.local."}
${generated.includes("OPENMUSE_OWNER_SECRET") ? `\nOwner login secret (type it into the login form; it is not shown again):\n  ${env.OPENMUSE_OWNER_SECRET}\n` : ""}
Run locally:          npm run dev   (port 3100; the app origin must reach it, e.g. ngrok http --domain=<host> 3100)
Deploy to Cloudflare: npx wrangler login, then npm run deploy:cloudflare (creates the KV namespace, uploads the secrets, deploys).
Any Node host:        npm run build && npm start (PORT), with the variables from .env.local in the host's environment
                      (see .env.example); schedule POST /api/internal/return-path/tick or set OPENMUSE_RETURN_PATH=timer.
Recovery: lost the owner secret? Run \`npm run setup -- --rotate\` and redeploy the app; every existing login cookie stops working.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
