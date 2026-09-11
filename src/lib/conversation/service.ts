// The single coordinator session: create or reuse it with its memory
// bindings, keep the event subscription that returns worker outcomes to it,
// send owner turns, request interruption. History and live turns are read
// by the browser through the session proxy (routes/api/sessions).
import type { MemoryBindings } from "@opencomputer/sdk";
import { env } from "@/lib/env";
import { memory } from "@/lib/memory";
import { OcError, oc } from "@/lib/oc/client";
import {
  activeDeploymentId,
  createOrReuseSession,
  interruptSession,
  queueTurn,
  readSession,
  sessionUsable,
} from "@/lib/oc/sessions";
import { type CoordinatorRecord, readState, updateState } from "@/lib/state/store";

export const PROFILE_DOCUMENT = "owner";

// The coordinator reads and saves the owner profile and browses the topics
// collection with memory_list and memory_read; it never binds one topic.
const COORDINATOR_MEMORY: MemoryBindings = {
  profile: { scope: "document", id: PROFILE_DOCUMENT, access: "read-write" },
  topics: { scope: "collection", access: "read" },
};

// The profile document must exist before a session binds it. Created once,
// empty; the coordinator fills it as the owner states preferences.
export async function ensureProfileDocument(): Promise<void> {
  const created = await memory.create("profile", PROFILE_DOCUMENT, { title: "Owner profile" });
  if (created.status === "deleted") {
    throw new Error(
      `The profile document "${PROFILE_DOCUMENT}" was deleted and its id is reserved by the platform; restore it under a new id`,
    );
  }
}

// Idempotent by installation + coordinator + deployment: the same key always
// returns the same session, and a crash between create and record is safe.
export async function coordinatorSessionId(): Promise<string> {
  const state = await readState();
  if (state.coordinator && sessionUsable(await readSession(state.coordinator.sessionId))) {
    await ensureOutcomeSubscription(state.coordinator);
    return state.coordinator.sessionId;
  }
  await ensureProfileDocument();
  const deploymentId = await activeDeploymentId(env().coordinatorAgent);
  const predecessor = state.coordinator?.sessionId ?? state.previousCoordinatorSessionIds?.at(-1);
  const key = `coordinator/${deploymentId}${predecessor ? `/after/${predecessor}` : ""}`;
  const created = await createOrReuseSession(env().coordinatorAgent, key, COORDINATOR_MEMORY);
  const record = await updateState((current) => {
    const next: CoordinatorRecord = { sessionId: created.id, deploymentId };
    return { state: { ...current, coordinator: next }, result: next };
  });
  await ensureOutcomeSubscription(record);
  return created.id;
}

// The return path: one event subscription per coordinator session delivers
// every worker turn's outcome (completed, failed, cancelled) to it as a turn
// with `source: "event"` input. Subscriptions are immutable and select by
// agent, so the subscription follows the session: created with it, deleted
// when it is replaced. A failure to create it (the routes answer 404 until
// the backend half is deployed) is logged and retried on a later call, at
// most once a minute, so the app heals without a restart.
let subscriptionAttemptAt = 0;

async function ensureOutcomeSubscription(record: CoordinatorRecord): Promise<void> {
  if (record.subscriptionId || Date.now() - subscriptionAttemptAt < 60_000) return;
  subscriptionAttemptAt = Date.now();
  try {
    const subscription = await oc.createEventSubscription({
      agentId: env().workerAgent,
      events: ["turn.completed", "turn.failed", "turn.cancelled"],
      destination: { type: "session", sessionId: record.sessionId },
      environment: env().environment,
    });
    await updateState((current) => {
      if (current.coordinator?.sessionId !== record.sessionId) return { state: current, result: undefined };
      return {
        state: { ...current, coordinator: { ...current.coordinator, subscriptionId: subscription.id } },
        result: undefined,
      };
    });
    console.log(
      JSON.stringify({
        level: "info",
        event: "return_path.subscribed",
        sessionId: record.sessionId,
        subscriptionId: subscription.id,
      }),
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "return_path.subscription_failed",
        sessionId: record.sessionId,
        status: error instanceof OcError ? error.status : undefined,
        code: error instanceof OcError ? error.code : undefined,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export async function sendOwnerMessage(text: string, idempotencyKey: string = crypto.randomUUID()) {
  const sessionId = await coordinatorSessionId();
  return { sessionId, ...(await queueTurn(sessionId, text, idempotencyKey)) };
}

// Deliberate replacement (upgrade or recovery): delete the subscription so
// no outcome is delivered to a session about to end, end the predecessor so
// its memory access is revoked, then admit a successor keyed on it against
// the current deployment with its own subscription. The old session's
// history stays linked in the state file; the successor starts from the
// current notes, not a copied transcript.
export async function replaceCoordinator(): Promise<{ endedSessionId?: string; sessionId: string }> {
  const predecessor = (await readState()).coordinator;
  if (predecessor) {
    if (predecessor.subscriptionId) await oc.deleteEventSubscription(predecessor.subscriptionId);
    try {
      await oc.end(predecessor.sessionId);
    } catch {
      /* already ended */
    }
    await updateState((current) => ({
      state: {
        ...current,
        coordinator: undefined,
        previousCoordinatorSessionIds: [...(current.previousCoordinatorSessionIds ?? []), predecessor.sessionId],
      },
      result: undefined,
    }));
  }
  return { endedSessionId: predecessor?.sessionId, sessionId: await coordinatorSessionId() };
}

export const STOP_COORDINATOR =
  "[stop] The owner pressed Stop. Stop the current work; reply in one short sentence with where things stand.";

export async function stopCoordinator() {
  const sessionId = await coordinatorSessionId();
  return { sessionId, ...(await interruptSession(sessionId, STOP_COORDINATOR)) };
}
