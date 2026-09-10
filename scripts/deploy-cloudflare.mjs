// The one command that puts the app on Cloudflare Workers:
//   npm run deploy:cloudflare
// It creates the KV namespace the interim state store needs (once, writing
// its id into wrangler.jsonc), builds the Worker, uploads the app's secrets
// from .env.local, and runs `wrangler deploy`. Needs `npx wrangler login`.
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readEnvFile, root } from "./env-file.mjs";

const SECRET_NAMES = [
  "OPENCOMPUTER_API_KEY",
  "OPENCOMPUTER_PROJECT_ID",
  "OPENCOMPUTER_ENVIRONMENT",
  "OPENCOMPUTER_API_URL",
  "OPENMUSE_OWNER_SECRET",
  "OPENMUSE_COOKIE_SECRET",
  "OPENMUSE_AGENT_SECRET",
  "OPENMUSE_INSTALLATION_ID",
  "OPENMUSE_APP_ORIGIN",
  "OPENMUSE_COORDINATOR_AGENT",
  "OPENMUSE_WORKER_AGENT",
  "OPENMUSE_MEMORY",
];

function run(command, args, { input, capture = false, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: fileURLToPath(root),
      stdio: [input === undefined ? "inherit" : "pipe", capture ? "pipe" : "inherit", "inherit"],
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout?.on("data", (data) => {
      output += data;
    });
    if (input !== undefined) child.stdin.end(input);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} failed (exit ${code})`)),
    );
  });
}

const wrangler = (args, options) =>
  run(process.execPath, [fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", root)), ...args], options);

try {
  const env = await readEnvFile();
  const missing = [
    "OPENCOMPUTER_API_KEY",
    "OPENCOMPUTER_PROJECT_ID",
    "OPENMUSE_OWNER_SECRET",
    "OPENMUSE_COOKIE_SECRET",
    "OPENMUSE_AGENT_SECRET",
  ].filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing in .env.local: ${missing.join(", ")}. Run npm run setup first.`);

  const configPath = new URL("wrangler.jsonc", root);
  let config = await readFile(configPath, "utf8");
  if (config.includes('"id": "openmuse-store-local"')) {
    console.log("Creating the OPENMUSE_STORE KV namespace…");
    const output = await wrangler(["kv", "namespace", "create", "OPENMUSE_STORE"], { capture: true });
    process.stdout.write(output);
    const id = output.match(/"id":\s*"([a-f0-9]{32})"/)?.[1];
    if (!id)
      throw new Error("Could not read the namespace id from wrangler's output; put it into wrangler.jsonc by hand.");
    config = config.replace('"id": "openmuse-store-local"', `"id": "${id}"`);
    await writeFile(configPath, config);
    console.log(`Wrote the namespace id ${id} into wrangler.jsonc; commit that change.`);
  }

  console.log("Building the Worker…");
  await run("npx", ["vite", "build"], { env: { OPENMUSE_TARGET: "cloudflare" } });

  console.log("Uploading secrets…");
  const secrets = Object.fromEntries(SECRET_NAMES.filter((name) => env[name]).map((name) => [name, env[name]]));
  await wrangler(["secret", "bulk"], { input: JSON.stringify(secrets) });

  console.log("Deploying…");
  await wrangler(["deploy"]);
  console.log(`
Deployed. If the Worker's URL is not the OPENMUSE_APP_ORIGIN the agents were deployed with, run
  npm run setup -- --origin https://<worker host>
so the agents' managed connection points at it, then deploy again.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
