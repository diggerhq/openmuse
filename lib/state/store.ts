// The app's own small index: which coordinator session is live, which topics
// exist and which worker session each one has, and the return path's
// delivery ledger. FIXTURE-PHASE STORAGE: one JSON file under
// OPENMUSE_STATE_DIR (default ./.openmuse). It is a cache of platform facts
// plus the topic index; when project memory lands the topic index moves to the
// topics collection and this file keeps only the session map. There is no
// database. On a host without a persistent disk (Vercel) the file does not
// survive a redeploy; see README.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

export interface TopicRecord {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly archived: boolean;
  /** The topic's one ongoing worker session; replaced deliberately, never per task. */
  readonly workerSessionId?: string;
  readonly workerDeploymentId?: string;
  /** Previous worker sessions, oldest first, kept as history links. */
  readonly previousWorkerSessionIds: readonly string[];
  /** invocationId -> turnId, so a retried start converges on one admitted turn. */
  readonly invocations: Readonly<Record<string, string>>;
  /** The revision each worker session last recalled, used as the expected revision of its saves. */
  readonly recalledRevision: Readonly<Record<string, string>>;
}

export interface ReturnPathRecord {
  /** Last event seq seen on the worker session. */
  readonly cursor: number;
  /** workerTurnId -> coordinator turnId already queued for it. */
  readonly delivered: Readonly<Record<string, string>>;
}

export interface AppState {
  readonly version: 1;
  readonly coordinator?: { readonly sessionId: string; readonly deploymentId: string };
  /** Earlier coordinator sessions, oldest first, kept as history links after a deliberate replacement. */
  readonly previousCoordinatorSessionIds?: readonly string[];
  readonly coordinatorRecalledRevision?: string;
  readonly topics: Readonly<Record<string, TopicRecord>>;
  readonly returnPath: Readonly<Record<string, ReturnPathRecord>>;
}

const EMPTY: AppState = { version: 1, topics: {}, returnPath: {} };

let queue: Promise<unknown> = Promise.resolve();
let cache: AppState | undefined;

function file(): string {
  return join(env().stateDir, "state.json");
}

async function load(): Promise<AppState> {
  if (cache) return cache;
  try {
    cache = { ...EMPTY, ...(JSON.parse(await readFile(file(), "utf8")) as AppState) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cache = EMPTY;
  }
  return cache;
}

async function persist(state: AppState): Promise<void> {
  await mkdir(env().stateDir, { recursive: true, mode: 0o700 });
  const temp = `${file()}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, file());
  cache = state;
}

export function readState(): Promise<AppState> {
  return load();
}

// Serialized read-modify-write; the updater returns the next state.
export function updateState<T>(update: (state: AppState) => { state: AppState; result: T } | Promise<{ state: AppState; result: T }>): Promise<T> {
  const run = queue.then(async () => {
    const current = await load();
    const { state, result } = await update(current);
    if (state !== current) await persist(state);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
