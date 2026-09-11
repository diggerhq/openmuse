// Development-only conversation log: what the owner saw and what the app
// did, one JSON line each, under the state directory
// (.openmuse/transcript.jsonl, gitignored). Only the Vite dev server writes
// it (import.meta.env.MODE is "development" there and nowhere else; a
// production build compiles the checks to false) and only with the fs
// store, so tests and hosts never do. Lines carry timestamps and the
// session and turn ids they concern, so a session in the dashboard can be
// matched to what the browser rendered.
import { env } from "@/lib/env";
import type { OcEvent } from "@/lib/oc/client";

export type TranscriptEntry =
  /** A turn the owner sent, from either conversation. */
  | { kind: "owner.message"; conversation: "coordinator" | "worker"; sessionId: string; turnId: string; text: string }
  /** The owner pressed Stop. */
  | { kind: "stop.requested"; conversation: "coordinator" | "worker"; sessionId: string; turnId?: string }
  /** start_topic admitted a task on a worker session. */
  | {
      kind: "topic.started";
      topicId: string;
      title: string;
      sessionId: string;
      turnId: string;
      newTopic: boolean;
      duplicate: boolean;
    }
  /** The fallback return path queued a worker outcome on the coordinator. */
  | { kind: "outcome.queued"; workerSessionId: string; workerTurnId: string; sessionId: string; turnId: string }
  /** The outcome subscription for the coordinator session was created. */
  | { kind: "subscription.created"; sessionId: string; subscriptionId: string }
  /** An event the browser received through the session proxy. */
  | {
      kind: "event";
      conversation: "coordinator" | "worker";
      sessionId: string;
      seq: number;
      type: string;
      turnId?: string;
      timestamp?: string;
      text?: string;
      data?: Record<string, unknown>;
    };

export function transcriptEnabled(): boolean {
  return import.meta.env.MODE === "development" && env().stateStore === "fs";
}

let writing: Promise<unknown> = Promise.resolve();

export function record(entry: TranscriptEntry): void {
  if (!transcriptEnabled()) return;
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
  writing = writing
    .then(async () => {
      const { appendFile, mkdir } = await import("node:fs/promises");
      await mkdir(env().stateDir, { recursive: true, mode: 0o700 });
      await appendFile(`${env().stateDir}/transcript.jsonl`, line, { mode: 0o600 });
    })
    .catch((error) =>
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "transcript.write_failed",
          message: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
}

const RECORDED_TYPES = new Set([
  "message.received",
  "message.completed",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "memory.saved",
  "session.failed",
]);

// The browser polls from a cursor and may read an overlapping page after a
// reconnect; each event is written once per process.
const lastSeq = new Map<string, number>();

/** The events of one poll, as the browser is about to see them. */
export function recordEvents(
  conversation: "coordinator" | "worker",
  sessionId: string,
  events: readonly OcEvent[],
): void {
  if (!transcriptEnabled()) return;
  let seen = lastSeq.get(sessionId) ?? 0;
  for (const event of events) {
    if (event.seq <= seen) continue;
    seen = event.seq;
    if (!RECORDED_TYPES.has(event.type)) continue;
    const text =
      event.type === "message.received"
        ? event.data.input
        : event.type === "message.completed"
          ? event.data.text
          : undefined;
    record({
      kind: "event",
      conversation,
      sessionId,
      seq: event.seq,
      type: event.type,
      ...(event.turnId ? { turnId: event.turnId } : {}),
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      ...(typeof text === "string" ? { text } : {}),
      ...(typeof text === "string" ? {} : { data: event.data }),
    });
  }
  lastSeq.set(sessionId, seen);
}
