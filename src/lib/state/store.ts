// The app's own small index: which coordinator session is live (and the
// event subscription that delivers worker outcomes to it), and which worker
// session each topic has. Everything else about a topic is its memory
// document. One JSON document ("state.json") in the blob store
// (store/blob.ts); there is no database. The session map is what the
// platform cannot answer: sessions are found again by their idempotency
// key only until they are replaced, and the session list has no filter.
import { blobs } from "@/lib/store";

export interface TopicRecord {
  readonly id: string;
  /** The topic's one ongoing worker session; replaced deliberately, never per task. */
  readonly workerSessionId?: string;
  readonly workerDeploymentId?: string;
  /** Previous worker sessions, oldest first, kept as history links. */
  readonly previousWorkerSessionIds: readonly string[];
}

export interface CoordinatorRecord {
  readonly sessionId: string;
  readonly deploymentId: string;
  /** The event subscription that delivers worker outcomes to this session, once created. */
  readonly subscriptionId?: string;
}

/** The fallback return path's ledger for one worker session (lib/return-path). */
export interface ReturnPathRecord {
  /** Last event seq seen on the worker session. */
  readonly cursor: number;
  /** workerTurnId -> coordinator turnId already queued for it (or "skipped"). */
  readonly delivered: Readonly<Record<string, string>>;
}

export interface AppState {
  readonly version: 2;
  readonly coordinator?: CoordinatorRecord;
  /** Earlier coordinator sessions, oldest first, kept as history links after a deliberate replacement. */
  readonly previousCoordinatorSessionIds?: readonly string[];
  readonly topics: Readonly<Record<string, TopicRecord>>;
  /** Present only while the fallback return path runs; keyed by worker session id. */
  readonly returnPath?: Readonly<Record<string, ReturnPathRecord>>;
}

const EMPTY: AppState = { version: 2, topics: {} };
const KEY = "state.json";

let queue: Promise<unknown> = Promise.resolve();

// Only the fields above survive a load: an older state file (version 1
// also carried recall revisions) is read for its session map and ledger and
// rewritten in this shape on the next update.
function normalize(raw: Partial<AppState>): AppState {
  const topics: Record<string, TopicRecord> = {};
  for (const [id, topic] of Object.entries(raw.topics ?? {})) {
    topics[id] = {
      id,
      ...(topic.workerSessionId ? { workerSessionId: topic.workerSessionId } : {}),
      ...(topic.workerDeploymentId ? { workerDeploymentId: topic.workerDeploymentId } : {}),
      previousWorkerSessionIds: topic.previousWorkerSessionIds ?? [],
    };
  }
  return {
    version: 2,
    ...(raw.coordinator
      ? {
          coordinator: {
            sessionId: raw.coordinator.sessionId,
            deploymentId: raw.coordinator.deploymentId,
            ...(raw.coordinator.subscriptionId ? { subscriptionId: raw.coordinator.subscriptionId } : {}),
          },
        }
      : {}),
    ...(raw.previousCoordinatorSessionIds?.length
      ? { previousCoordinatorSessionIds: raw.previousCoordinatorSessionIds }
      : {}),
    topics,
    ...(raw.returnPath && Object.keys(raw.returnPath).length ? { returnPath: raw.returnPath } : {}),
  };
}

// Always read from the store: route handlers may be separate module
// instances, and the store is the only shared truth.
async function load(): Promise<AppState> {
  const text = await blobs().get(KEY);
  return text ? normalize(JSON.parse(text) as Partial<AppState>) : EMPTY;
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
