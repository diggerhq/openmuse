// Stages what the two agents need before doctor/deploy:
//  1. scripts/templates/memory.ts -> each agent's memory.ts: the two
//     defineMemory() declarations, identical in both agents (the compiler
//     reads only modules inside an agent's directory, and declarations that
//     share an id must agree)
//  2. scripts/templates/app-connection.ts -> each agent's tools/app.ts
//     with the app origin from OPENMUSE_APP_ORIGIN (the CLI reads
//     defineConnection() origins from source, so it must be a literal)
//  3. removes the CLI's previous generated runtime so doctor does not scan it.

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";

const root = new URL("../", import.meta.url);
if (existsSync(new URL(".env.local", root))) loadEnvFile(new URL(".env.local", root));

const agents = ["coordinator", "topic-worker"];

const origin = process.env.OPENMUSE_APP_ORIGIN?.trim();
if (!origin)
  throw new Error("Set OPENMUSE_APP_ORIGIN (npm run setup -- --origin https://...) before preparing the agents");
const url = new URL(origin);
if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
  throw new Error("OPENMUSE_APP_ORIGIN must be an https origin without a path");
}
const memory = await readFile(new URL("scripts/templates/memory.ts", root), "utf8");
const connection = await readFile(new URL("scripts/templates/app-connection.ts", root), "utf8");

for (const agent of agents) {
  const dir = new URL(`opencomputer/agents/${agent}/`, root);
  await rm(new URL(".opencomputer/", dir), { recursive: true, force: true });
  await rm(new URL("memory/", dir), { recursive: true, force: true });
  await writeFile(new URL("memory.ts", dir), memory);
  await writeFile(
    new URL("tools/app.ts", dir),
    connection.replace("__APP_ORIGIN__", url.origin).replace("__AGENT__", agent),
  );
}
console.log(`Prepared agents for app origin ${url.origin}.`);
