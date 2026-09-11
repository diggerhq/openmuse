// FALLBACK RETURN PATH. The platform delivers worker outcomes to the
// coordinator through the event subscription the app creates next to the
// coordinator session (lib/conversation/service.ts). Until the backend half
// of event subscriptions is deployed (blue #64), that create answers 404 and
// this module stands in: one pass (`tick`) reads every topic's worker
// session for terminal turn events and queues one coordinator turn per
// worker turn, with the same text the platform records for a delivered
// outcome, so the coordinator and the browser handle one format. The turn's
// idempotency key derives from the worker turn id and the ledger in the
// state store records it, so a retry never admits a second report. The pass
// does nothing while the coordinator has a subscription. Delete this
// directory, the timer start in src/server.ts, the cron trigger in
// wrangler.jsonc and the text parse in the coordinator agent once #64 is on
// production.
//
// Drivers: the Cloudflare cron trigger calls `tick` from the server entry's
// `scheduled` handler; on Node the in-process timer (timer.ts) does; in local
// Cloudflare development the Vite plugin in dev-trigger.ts fires the
// scheduled handler every few seconds.

import { coordinatorSessionId } from "@/lib/conversation/service";
import { env } from "@/lib/env";
import { allEvents, type OcEvent } from "@/lib/oc/client";
import { queueTurn, readSession } from "@/lib/oc/sessions";
import { readState, updateState } from "@/lib/state/store";
import { record } from "@/lib/transcript";

// The platform bounds a delivered result to 16 KB.
const MAX_RESULT_BYTES = 16 * 1024;

export interface Outcome {
  readonly type: "turn.completed" | "turn.failed" | "turn.cancelled";
  readonly agentId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly error?: string;
  readonly result?: { readonly text: string; readonly truncated: boolean };
}

/** The text the platform records as the input of a turn it delivers an outcome to. */
export function outcomeText(event: Outcome): string {
  const where = `agent ${event.agentId} (session ${event.sessionId}, turn ${event.turnId}) at ${event.occurredAt}`;
  switch (event.type) {
    case "turn.completed":
      return `Outcome event turn.completed from ${where}.\nResult${event.result?.truncated ? " (truncated)" : ""}:\n${event.result?.text ?? ""}`;
    case "turn.failed":
      return `Outcome event turn.failed from ${where}${event.reason ? ` (${event.reason})` : ""}.${event.error ? `\nError: ${event.error}` : ""}`;
    case "turn.cancelled":
      return `Outcome event turn.cancelled from ${where}${event.reason ? ` (${event.reason})` : ""}.`;
  }
}

function bounded(text: string): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= MAX_RESULT_BYTES) return { text, truncated: false };
  return { text: new TextDecoder().decode(bytes.slice(0, MAX_RESULT_BYTES)), truncated: true };
}

/** One worker turn's outcome from its session's events, once it has settled. */
export function outcomeOf(events: readonly OcEvent[], sessionId: string, turnId: string): Outcome | null {
  let text = "";
  for (const event of events) {
    if (event.turnId !== turnId) continue;
    if (event.type === "message.completed" && typeof event.data.text === "string") text = event.data.text;
    const base = {
      agentId: env().workerAgent,
      sessionId,
      turnId,
      occurredAt: event.timestamp ?? new Date().toISOString(),
    };
    if (event.type === "turn.completed") return { type: "turn.completed", ...base, result: bounded(text) };
    if (event.type === "turn.failed") {
      return {
        type: "turn.failed",
        ...base,
        ...(typeof event.data.code === "string" ? { reason: event.data.code } : {}),
        ...(typeof event.data.message === "string" ? { error: event.data.message.slice(0, 1000) } : {}),
      };
    }
    if (event.type === "turn.cancelled") {
      return {
        type: "turn.cancelled",
        ...base,
        ...(typeof event.data.reason === "string" ? { reason: event.data.reason } : {}),
      };
    }
  }
  return null;
}

let ticking = false;

// One pass over all worker sessions. Returns the number of outcomes delivered.
export async function tick(): Promise<number> {
  if (ticking) return 0;
  ticking = true;
  try {
    const state = await readState();
    // The platform delivers to this coordinator; nothing to do here.
    if (state.coordinator?.subscriptionId) return 0;
    let delivered = 0;
    for (const topic of Object.values(state.topics)) {
      const sessionId = topic.workerSessionId;
      if (!sessionId) continue;
      const ledger = state.returnPath?.[sessionId] ?? { cursor: 0, delivered: {} };
      let events: OcEvent[];
      try {
        events = await allEvents(sessionId, ledger.cursor);
      } catch {
        continue;
      }
      if (events.length === 0) continue;
      const cursor = Math.max(ledger.cursor, ...events.map((event) => event.seq));
      const terminal = events.filter(
        (event) =>
          event.turnId &&
          (event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.cancelled"),
      );
      const deliveredNow: Record<string, string> = {};
      // The session record names each turn's mode; a Stop turn's own
      // completion is not an outcome worth reporting, the interrupted turn's
      // cancellation is.
      const turns = terminal.length ? ((await readSession(sessionId))?.turns ?? []) : [];
      for (const event of terminal) {
        const workerTurnId = event.turnId;
        if (!workerTurnId) continue;
        if (ledger.delivered[workerTurnId] || deliveredNow[workerTurnId]) continue;
        if (turns.find((turn) => turn.id === workerTurnId)?.mode === "interrupt") {
          deliveredNow[workerTurnId] = "skipped";
          continue;
        }
        const outcome = outcomeOf(events, sessionId, workerTurnId);
        if (!outcome) continue;
        try {
          const coordinator = await coordinatorSessionId();
          const turn = await queueTurn(coordinator, outcomeText(outcome), `outcome/${workerTurnId}`);
          record({
            kind: "outcome.queued",
            workerSessionId: sessionId,
            workerTurnId,
            sessionId: coordinator,
            turnId: turn.turnId,
          });
          deliveredNow[workerTurnId] = turn.turnId;
          delivered += 1;
        } catch (error) {
          console.error(
            JSON.stringify({
              level: "error",
              event: "return_path.deliver_failed",
              topicId: topic.id,
              workerTurnId,
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }
      await updateState((current) => ({
        state: {
          ...current,
          returnPath: {
            ...current.returnPath,
            [sessionId]: {
              cursor,
              delivered: { ...(current.returnPath?.[sessionId]?.delivered ?? {}), ...deliveredNow },
            },
          },
        },
        result: undefined,
      }));
    }
    return delivered;
  } finally {
    ticking = false;
  }
}
