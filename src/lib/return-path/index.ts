// INTERIM RETURN PATH. Delete this directory when the platform delivers
// worker turn outcomes to the coordinator itself (work 025 internal
// destinations).
//
// One pass (`tick`) reads every topic's worker session for terminal turn
// events and queues one coordinator turn per worker turn with a typed outcome
// summary. The coordinator turn's idempotency key is derived from the worker
// turn id, and the delivery ledger in the state store records it, so a retry
// or a second driver never admits a second report.
//
// Drivers, same module:
//   - a scheduler: the Cloudflare cron trigger calls `tick` from the server
//     entry's `scheduled` handler; any other host's scheduler can POST
//     /api/internal/return-path/tick with the agent secret;
//   - an in-process timer (timer.ts) when OPENMUSE_RETURN_PATH=timer, for
//     long-lived hosts such as Docker or `npm start`;
//   - in local Cloudflare development, the Vite plugin in dev-trigger.ts
//     fires the scheduled handler every few seconds.

import { sendAppMessage } from "@/lib/conversation/service";
import { turnResult } from "@/lib/events/messages";
import { allEvents, type OcEvent } from "@/lib/oc/client";
import { readSession } from "@/lib/oc/sessions";
import { readState, updateState } from "@/lib/state/store";

const MAX_RESULT_CHARS = 6000;

export interface Outcome {
  readonly topicId: string;
  readonly title: string;
  readonly workerSessionId: string;
  readonly workerTurnId: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly text: string;
  readonly detail?: string;
}

export function outcomeMessage(outcome: Outcome): string {
  const header = JSON.stringify({
    topicId: outcome.topicId,
    title: outcome.title,
    workerSessionId: outcome.workerSessionId,
    workerTurnId: outcome.workerTurnId,
    status: outcome.status,
    ...(outcome.detail ? { detail: outcome.detail } : {}),
  });
  const body =
    outcome.text.length > MAX_RESULT_CHARS ? `${outcome.text.slice(0, MAX_RESULT_CHARS)}\n…(truncated)` : outcome.text;
  return `[topic outcome] ${header}\n\n${body || "(the worker produced no final message)"}`;
}

let ticking = false;

// One pass over all worker sessions. Returns the number of outcomes delivered.
export async function tick(): Promise<number> {
  if (ticking) return 0;
  ticking = true;
  try {
    const state = await readState();
    let delivered = 0;
    for (const topic of Object.values(state.topics)) {
      const sessionId = topic.workerSessionId;
      if (!sessionId) continue;
      const ledger = state.returnPath[sessionId] ?? { cursor: 0, delivered: {} };
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
        const result = turnResult(events, workerTurnId);
        if (result.status === "running") continue;
        const outcome: Outcome = {
          topicId: topic.id,
          title: topic.title,
          workerSessionId: sessionId,
          workerTurnId,
          status: result.status,
          text: result.text,
          detail: result.detail,
        };
        try {
          const turn = await sendAppMessage(outcomeMessage(outcome), `outcome/${workerTurnId}`);
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
              delivered: { ...(current.returnPath[sessionId]?.delivered ?? {}), ...deliveredNow },
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
