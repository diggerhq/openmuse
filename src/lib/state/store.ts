// The app's own small index: which coordinator session is live, which topics
// exist and which worker session each one has, and the return path's
// delivery ledger. INTERIM: one JSON document ("state.json") in the blob
// store (see store/blob.ts). It is a cache of platform facts plus the topic
// index; when project memory lands the topic index moves to the topics
// collection and this file keeps only the session map. There is no database.
import { blobs } from "@/lib/store";

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
const KEY = "state.json";

let queue: Promise<unknown> = Promise.resolve();

// Always read from the store: the return-path driver and the route handlers
// may be separate module instances, and the store is the only shared truth.
async function load(): Promise<AppState> {
  const text = await blobs().get(KEY);
  return text ? { ...EMPTY, ...(JSON.parse(text) as AppState) } : EMPTY;
}

export function readState(): Promise<AppState> {
  return load();
}

// Serialized read-modify-write; the updater returns the next state.
export function updateState<T>(
  update: (state: AppState) => { state: AppState; result: T } | Promise<{ state: AppState; result: T }>,
): Promise<T> {
  const run = queue.then(async () => {
    const current = await load();
    const { state, result } = await update(current);
    if (state !== current) await blobs().put(KEY, `${JSON.stringify(state, null, 2)}\n`);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}
