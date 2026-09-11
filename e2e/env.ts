// The suite reads .env.local the way the app does (the cookie secret to mint
// the owner cookie, the OpenComputer key for the teardown); values already
// in the environment win.
import { readFileSync } from "node:fs";

export function loadEnv(): void {
  let text = "";
  try {
    text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match?.[1] && process.env[match[1]] === undefined) process.env[match[1]] = match[2] ?? "";
  }
}
