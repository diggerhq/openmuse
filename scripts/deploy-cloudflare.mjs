// The CLI path onto Cloudflare Workers, from a laptop with .env.local:
//   npm run deploy:cloudflare
// It creates the KV namespace the session map needs (once, writing its id
// into wrangler.jsonc), runs `npm run deploy` (the Cloudflare build +
// `wrangler deploy`, which is also what the Deploy to Cloudflare button and
// Workers Builds run; there the platform supplies the namespace and the
// secrets instead), then uploads the app's secrets from .env.local.
// Needs `npx wrangler login`; with several accounts set CLOUDFLARE_ACCOUNT_ID.
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

  console.log("Building and deploying…");
  await run("npm", ["run", "deploy"]);

  // After the deploy so the Worker exists; secrets apply to the live Worker at once.
  console.log("Uploading secrets…");
  const secrets = Object.fromEntries(SECRET_NAMES.filter((name) => env[name]).map((name) => [name, env[name]]));
  await wrangler(["secret", "bulk"], { input: JSON.stringify(secrets) });
  console.log(`
Deployed. If the Worker's URL is not the OPENMUSE_APP_ORIGIN the agents were deployed with, run
  npm run setup -- --origin https://<worker host>
so the agents' managed connection points at it, then deploy again.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
