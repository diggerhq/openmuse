// One-time installation. Generates the owner login secret, the cookie signing
// secret and the agent installation secret into .env.local, copies the
// OpenComputer key from the CLI login into it (the app reads configuration
// from the environment only), links or creates the OpenComputer project and,
// once the app's public origin is known, deploys both agents to Development
// pinned to that origin. It never prints the OpenComputer key.
//
//   npm run setup -- --origin https://your-app.example
//       generate what is missing, link the project, deploy the agents to the origin.
//   npm run setup -- --target <cloudflare|docker|railway|render|fly|digitalocean>
//       the same, then print the exact steps for that host; --origin may come
//       later, after the host has given the app its URL.
//   npm run setup -- --rotate
//       new owner + cookie secrets; every existing login stops working.
//
// The installation secret is not uploaded here: the app registers it with the
// platform, for its own origin, each time the owner signs in
// (src/lib/oc/installation.ts). Hosts that generate secrets (Render) therefore
// need only the OpenComputer key and the project id.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvFile, root, writeEnvFile } from "./env-file.mjs";

const TARGETS = ["cloudflare", "docker", "railway", "render", "fly", "digitalocean"];

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

// What to paste into a host that cannot generate values, by name only; the
// values are in .env.local. The OpenComputer key is never printed anywhere.
const PASTE = ["OPENCOMPUTER_API_KEY", "OPENCOMPUTER_PROJECT_ID", "OPENMUSE_OWNER_SECRET", "OPENMUSE_COOKIE_SECRET"];
const PASTE_WITH_AGENT = [...PASTE, "OPENMUSE_AGENT_SECRET"];

function steps(target, env, originKnown) {
  const finish = originKnown
    ? "The agents are deployed for that origin. Open it and sign in with OPENMUSE_OWNER_SECRET from .env.local."
    : "When the host has given the app its URL:\n  npm run setup -- --origin https://<the app's host>\nthen open it and sign in with OPENMUSE_OWNER_SECRET from .env.local.";
  const paste = (names) => `Paste, from .env.local: ${names.join(", ")}.`;
  switch (target) {
    case "cloudflare":
      return `Cloudflare Workers (docs/deploy/cloudflare.md)
  Button (public repository only): https://deploy.workers.cloudflare.com/?url=https://github.com/diggerhq/openmuse
    ${paste(PASTE_WITH_AGENT)} Cloudflare creates the KV namespace and the cron trigger from wrangler.jsonc.
  CLI:  npx wrangler login && npm run deploy:cloudflare
    creates the KV namespace, uploads every value in .env.local as a Worker secret, deploys; prints the Worker URL.
${finish}`;
    case "docker":
      return `Docker (docs/deploy/docker.md)
  docker run -d --name openmuse -p 3000:3000 --env-file .env.local -v openmuse-data:/data ghcr.io/diggerhq/openmuse:latest
  .env.local already carries OPENMUSE_RETURN_PATH=timer; the image sets OPENMUSE_STATE_DIR=/data.
  Put an https origin in front (a reverse proxy or a tunnel); the agents call back to it.
${finish}`;
    case "railway":
      return `Railway (docs/deploy/railway.md)
  npm install -D railway && npx railway login && npx railway init
  npx railway config apply            # .railway/railway.ts: the service (Dockerfile), the /data volume, the health check
  npx railway variables --set "OPENCOMPUTER_API_KEY=..." --set "OPENCOMPUTER_PROJECT_ID=..." \\
    --set "OPENMUSE_OWNER_SECRET=..." --set "OPENMUSE_COOKIE_SECRET=..." --set "OPENMUSE_AGENT_SECRET=..."
    ${paste(PASTE_WITH_AGENT)}
  npx railway up && npx railway domain
${finish}`;
    case "render":
      return `Render (docs/deploy/render.md)
  Button: https://render.com/deploy?repo=https://github.com/diggerhq/openmuse
    ${paste(["OPENCOMPUTER_API_KEY", "OPENCOMPUTER_PROJECT_ID"])} Render generates the owner, cookie and agent secrets
    (render.yaml generateValue); read OPENMUSE_OWNER_SECRET in the service's Environment tab to sign in.
${finish.replace("OPENMUSE_OWNER_SECRET from .env.local", "the OPENMUSE_OWNER_SECRET Render generated")}`;
    case "fly":
      return `Fly.io (docs/deploy/fly.md)
  fly auth login && fly launch --copy-config --no-deploy   # fly.toml: Dockerfile build, /data volume, health check
  fly secrets import < .env.local                          # every value, including the OpenComputer key, from the file
  fly deploy
${finish}`;
    case "digitalocean":
      return `DigitalOcean App Platform (docs/deploy/digitalocean.md)
  Button (public repository only): https://cloud.digitalocean.com/apps/new?repo=https://github.com/diggerhq/openmuse/tree/main
    ${paste(PASTE_WITH_AGENT)} The spec is .do/deploy.template.yaml; no disk, so OPENMUSE_STATE_STORE=memory there.
${finish}`;
    default:
      return "";
  }
}

try {
  const env = await readEnvFile();
  const rotate = process.argv.includes("--rotate");
  const target = option("--target");
  if (target && !TARGETS.includes(target)) throw new Error(`--target must be one of ${TARGETS.join(", ")}`);
  const origin = option("--origin") ?? env.OPENMUSE_APP_ORIGIN;
  if (!origin && !target)
    throw new Error(
      "Pass --origin https://<the app's public https origin> (a tunnel for local runs, the host's URL for a deployment), or --target <host> to get the steps first.",
    );
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.pathname !== "/")
      throw new Error("--origin must be an https origin without a path");
    env.OPENMUSE_APP_ORIGIN = url.origin;
  }

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
  // Local runs and long-lived hosts: the interim return path ticks in-process.
  env.OPENMUSE_RETURN_PATH = env.OPENMUSE_RETURN_PATH || "timer";
  await writeEnvFile(env);

  if (!existsSync(new URL(".opencomputer/project.json", root))) {
    await cli(["link", "--create-project", "openmuse-dev"]);
  }
  const binding = JSON.parse(await readFile(new URL(".opencomputer/project.json", root), "utf8"));
  if (new URL(binding.apiUrl).origin !== env.OPENCOMPUTER_API_URL) {
    throw new Error(`The linked project targets ${binding.apiUrl}; the CLI login targets ${env.OPENCOMPUTER_API_URL}`);
  }
  // Cloud agent ids: the first agent in opencomputer/project.ts is the
  // project's primary agent id; the others are <primary>--<local id>.
  env.OPENCOMPUTER_PROJECT_ID = binding.projectId;
  env.OPENMUSE_COORDINATOR_AGENT = binding.agentId;
  env.OPENMUSE_WORKER_AGENT = `${binding.agentId}--topic-worker`;
  await writeEnvFile(env);

  if (env.OPENMUSE_APP_ORIGIN) {
    process.env.OPENMUSE_APP_ORIGIN = env.OPENMUSE_APP_ORIGIN;
    await import("./prepare-agent.mjs");
    await cli(["doctor"]);
    await cli(["deploy", "--alias", "development"]);
  }

  console.log(`
Ready. Project ${binding.projectName} (${binding.projectId}); agents ${env.OPENMUSE_COORDINATOR_AGENT} and ${env.OPENMUSE_WORKER_AGENT}${env.OPENMUSE_APP_ORIGIN ? ` deployed to Development for ${env.OPENMUSE_APP_ORIGIN}` : " not deployed yet (no origin)"}.
${generated.length ? `Generated ${generated.join(", ")} into .env.local (mode 600).` : "Kept the existing secrets in .env.local."}
${generated.includes("OPENMUSE_OWNER_SECRET") ? `\nOwner login secret (type it into the login form; it is not shown again):\n  ${env.OPENMUSE_OWNER_SECRET}\n` : ""}`);
  if (target) {
    console.log(steps(target, env, Boolean(env.OPENMUSE_APP_ORIGIN)));
  } else {
    console.log(`Run locally:          npm run dev   (port 3100; the app origin must reach it, e.g. ngrok http --domain=<host> 3100)
Deploy:               npm run setup -- --target <cloudflare|docker|railway|render|fly|digitalocean> prints the steps; README "Deploy" has the buttons.`);
  }
  console.log(
    "Recovery: lost the owner secret? Run `npm run setup -- --rotate`, put the new values on the host, redeploy; every existing login cookie stops working.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
