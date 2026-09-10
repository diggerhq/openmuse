// The single coordinator session: create or reuse it, replay its history,
// send owner turns, request interruption.
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { allEvents, oc, type OcEvent } from "@/lib/oc/client";
import { activeDeploymentId, createOrReuseSession, queueTurn, readSession, sessionUsable } from "@/lib/oc/sessions";
import { readState, updateState } from "@/lib/state/store";
import { composeTurnInput, recallForCoordinator } from "@/lib/memory/recall";
import { reduceEvents, type Timeline } from "@/lib/events/messages";

// Idempotent by installation + coordinator + deployment: the same key always
// returns the same session, and a crash between create and record is safe.
export async function coordinatorSessionId(): Promise<string> {
  const state = await readState();
  if (state.coordinator && sessionUsable(await readSession(state.coordinator.sessionId))) return state.coordinator.sessionId;
  const deploymentId = await activeDeploymentId(env().coordinatorAgent);
  const predecessor = state.coordinator?.sessionId ?? state.previousCoordinatorSessionIds?.at(-1);
  const key = `coordinator/${deploymentId}${predecessor ? `/after/${predecessor}` : ""}`;
  const created = await createOrReuseSession(env().coordinatorAgent, key);
  await updateState((current) => ({
    state: { ...current, coordinator: { sessionId: created.id, deploymentId } },
    result: undefined,
  }));
  return created.id;
}

export async function conversationHistory(): Promise<{ sessionId: string; timeline: Timeline; events: OcEvent[] }> {
  const sessionId = await coordinatorSessionId();
  const events = await allEvents(sessionId);
  return { sessionId, timeline: reduceEvents(events), events };
}

export async function sendOwnerMessage(text: string, idempotencyKey: string = randomUUID()) {
  const sessionId = await coordinatorSessionId();
  const recall = await recallForCoordinator();
  await updateState((current) => ({
    state: { ...current, coordinatorRecalledRevision: recall.profile?.revision },
    result: undefined,
  }));
  return { sessionId, ...(await queueTurn(sessionId, composeTurnInput(recall, text), idempotencyKey)) };
}

// The app's own turn on the coordinator, e.g. a worker outcome report.
export async function sendAppMessage(text: string, idempotencyKey: string) {
  const sessionId = await coordinatorSessionId();
  const recall = await recallForCoordinator();
  return { sessionId, ...(await queueTurn(sessionId, composeTurnInput(recall, text), idempotencyKey)) };
}

// Deliberate replacement (upgrade or recovery): end the predecessor so its
// access is revoked, then admit a successor keyed on it against the current
// deployment. The old session's history stays linked in the state file; the
// successor starts from the current notes, not a copied transcript.
export async function replaceCoordinator(): Promise<{ endedSessionId?: string; sessionId: string }> {
  const state = await readState();
  const ended = state.coordinator?.sessionId;
  if (ended) {
    try { await oc.end(ended); } catch { /* already ended */ }
    await updateState((current) => ({
      state: { ...current, coordinator: undefined, previousCoordinatorSessionIds: [...(current.previousCoordinatorSessionIds ?? []), ended] },
      result: undefined,
    }));
  }
  return { endedSessionId: ended, sessionId: await coordinatorSessionId() };
}

// Stop: the platform has no bare interrupt route; a turn in `interrupt` mode
// cancels the running turn and queues this one. The runtime may finish a
// started tool call before it stops.
export async function stopCoordinator() {
  const sessionId = await coordinatorSessionId();
  return { sessionId, ...(await oc.turn(sessionId, "[stop] The owner pressed Stop. Stop the current work; reply in one short sentence with where things stand.", randomUUID(), "interrupt")) };
}
