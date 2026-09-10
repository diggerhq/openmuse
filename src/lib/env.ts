// Runtime configuration is environment-only (see .env.example). Every host
// populates process.env: Node from the environment or .env.local (loaded by
// the Vite dev server), Cloudflare from the Worker's vars and secrets with
// nodejs_compat. Read lazily inside a request, never at module scope, because
// edge runtimes inject the environment per request.
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
  readonly appOrigin?: string;
  readonly stateStore: "fs" | "kv" | "memory";
  readonly stateDir: string;
  readonly secureCookies: boolean;
}

let cached: Env | undefined;

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`${name} is not set; run npm run setup or configure the deployment`);
  return value;
}

export function env(): Env {
  if (cached) return cached;
  const apiUrl = new URL(read("OPENCOMPUTER_API_URL") ?? "https://app.opencomputer.dev").origin;
  const environment = read("OPENCOMPUTER_ENVIRONMENT") ?? "development";
  if (environment !== "development" && environment !== "production") {
    throw new Error("OPENCOMPUTER_ENVIRONMENT must be development or production");
  }
  const stateStore = read("OPENMUSE_STATE_STORE") ?? "fs";
  if (stateStore !== "fs" && stateStore !== "kv" && stateStore !== "memory") {
    throw new Error("OPENMUSE_STATE_STORE must be fs, kv or memory");
  }
  const ownerSecret = required("OPENMUSE_OWNER_SECRET");
  const cookieSecret = required("OPENMUSE_COOKIE_SECRET");
  const agentSecret = required("OPENMUSE_AGENT_SECRET");
  if (ownerSecret.length < 16 || cookieSecret.length < 32 || agentSecret.length < 32) {
    throw new Error("OPENMUSE_* secrets are too short; generate them with npm run setup");
  }
  const appOrigin = read("OPENMUSE_APP_ORIGIN");
  const coordinatorAgent = read("OPENMUSE_COORDINATOR_AGENT") ?? "openmuse-dev";
  cached = {
    apiUrl,
    apiKey: required("OPENCOMPUTER_API_KEY"),
    projectId: required("OPENCOMPUTER_PROJECT_ID"),
    environment,
    coordinatorAgent,
    workerAgent: read("OPENMUSE_WORKER_AGENT") ?? `${coordinatorAgent}--topic-worker`,
    ownerSecret,
    cookieSecret,
    agentSecret,
    installationId: read("OPENMUSE_INSTALLATION_ID") ?? "default",
    ...(appOrigin ? { appOrigin: new URL(appOrigin).origin } : {}),
    stateStore,
    stateDir: read("OPENMUSE_STATE_DIR") ?? ".openmuse",
    // Cookies are Secure unless the app is explicitly run over plain http on localhost.
    secureCookies: read("OPENMUSE_ALLOW_INSECURE_COOKIES") !== "1",
  };
  return cached;
}

/** Test seam: forget the cached environment. */
export function resetEnvCache(): void {
  cached = undefined;
}
