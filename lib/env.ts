import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Env {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly projectId: string;
  readonly environment: "development" | "production";
  readonly coordinatorAgent: string;
  readonly workerAgent: string;
  readonly ownerSecret: string;
  readonly cookieSecret: string;
  readonly agentSecret: string;
  readonly installationId: string;
  readonly appOrigin: string;
  readonly stateDir: string;
  readonly secureCookies: boolean;
}

let cached: Env | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; run npm run setup or configure the deployment`);
  return value;
}

// The OpenComputer key is read from the environment. Locally, when it is not
// set, the CLI login in ~/.opencomputer/config.json is used so the key is
// never copied into a repository file. It is never logged or sent anywhere
// but the OpenComputer API.
function apiKey(apiUrl: string): string {
  const fromEnv = process.env.OPENCOMPUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  try {
    const config = JSON.parse(readFileSync(process.env.OPENCOMPUTER_CONFIG ?? join(homedir(), ".opencomputer/config.json"), "utf8")) as { apiUrl?: string; apiKey?: string };
    if (config.apiKey && new URL(config.apiUrl ?? apiUrl).origin === apiUrl) return config.apiKey;
  } catch { /* fall through */ }
  throw new Error("OPENCOMPUTER_API_KEY is not set and no CLI login matches OPENCOMPUTER_API_URL");
}

export function env(): Env {
  if (cached) return cached;
  const apiUrl = new URL(process.env.OPENCOMPUTER_API_URL?.trim() || "https://app.opencomputer.dev").origin;
  const environment = process.env.OPENCOMPUTER_ENVIRONMENT?.trim() || "development";
  if (environment !== "development" && environment !== "production") throw new Error("OPENCOMPUTER_ENVIRONMENT must be development or production");
  const appOrigin = new URL(required("OPENMUSE_APP_ORIGIN")).origin;
  const ownerSecret = required("OPENMUSE_OWNER_SECRET");
  const cookieSecret = required("OPENMUSE_COOKIE_SECRET");
  const agentSecret = required("OPENMUSE_AGENT_SECRET");
  if (ownerSecret.length < 16 || cookieSecret.length < 32 || agentSecret.length < 32) {
    throw new Error("OPENMUSE_* secrets are too short; generate them with npm run setup");
  }
  cached = {
    apiUrl,
    apiKey: apiKey(apiUrl),
    projectId: required("OPENCOMPUTER_PROJECT_ID"),
    environment,
    coordinatorAgent: required("OPENMUSE_COORDINATOR_AGENT"),
    workerAgent: required("OPENMUSE_WORKER_AGENT"),
    ownerSecret,
    cookieSecret,
    agentSecret,
    installationId: required("OPENMUSE_INSTALLATION_ID"),
    appOrigin,
    stateDir: process.env.OPENMUSE_STATE_DIR?.trim() || join(process.cwd(), ".openmuse"),
    // Cookies are Secure unless the app is explicitly run over plain http on localhost.
    secureCookies: process.env.OPENMUSE_ALLOW_INSECURE_COOKIES !== "1",
  };
  return cached;
}
