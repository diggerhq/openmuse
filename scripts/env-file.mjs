import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

export const root = new URL("../", import.meta.url);
export const envFile = new URL(".env.local", root);

export async function readEnvFile() {
  if (!existsSync(envFile)) return {};
  const values = {};
  for (const line of (await readFile(envFile, "utf8")).split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export async function writeEnvFile(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  const body = `${lines.join("\n")}\n`;
  await writeFile(envFile, body, { mode: 0o600 });
}
