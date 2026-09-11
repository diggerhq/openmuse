import assert from "node:assert/strict";
import { test } from "vitest";
import { applyActivity, emptyActivity, parseOutcome } from "@/lib/events/messages";
import type { OcEvent } from "@/lib/oc/client";
import { outcomeOf, outcomeText } from "@/lib/return-path";
import { testEnv } from "./env";

test("tool events become per-turn activity with durations, on both runtime shapes", () => {
  const events: OcEvent[] = [
    { seq: 1, type: "turn.started", turnId: "t1", timestamp: "2026-09-10T10:00:00.000Z", data: {} },
    {
      seq: 2,
      type: "tool.started",
      turnId: "t1",
      timestamp: "2026-09-10T10:00:01.000Z",
      data: { tool: "shell", input: { command: "ls -la" } },
    },
    {
      seq: 3,
      type: "tool.completed",
      turnId: "t1",
      timestamp: "2026-09-10T10:00:03.500Z",
      data: { tool: "shell", output: "total 0" },
    },
    // Durable Object shape: id + content, name arrives on progress.
    {
      seq: 4,
      type: "tool.started",
      turnId: "t1",
      timestamp: "2026-09-10T10:00:04.000Z",
      data: { id: "call-2", input: { command: "cat x" } },
    },
    { seq: 5, type: "tool.progress", turnId: "t1", data: { id: "call-2", metadata: { tool: "sandbox_exec" } } },
    {
      seq: 6,
      type: "tool.failed",
      turnId: "t1",
      timestamp: "2026-09-10T10:00:05.000Z",
      data: { id: "call-2", error: "no such file" },
    },
    { seq: 7, type: "turn.failed", turnId: "t1", timestamp: "2026-09-10T10:00:06.000Z", data: { message: "boom" } },
  ];
  const activity = events.reduce(applyActivity, emptyActivity());
  const calls = activity.tools.t1 ?? [];
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map((call) => [call.name, call.status]),
    [
      ["shell", "completed"],
      ["sandbox_exec", "failed"],
    ],
  );
  assert.equal(calls[0]?.output, "total 0");
  assert.equal(calls[1]?.output, "no such file");
  assert.equal(calls[0]?.endedAt, "2026-09-10T10:00:03.500Z");
  assert.equal(activity.turns.t1?.status, "failed");
  assert.equal(activity.turns.t1?.detail, "boom");
  assert.equal(activity.cursor, 7);
  // Replayed events below the cursor change nothing.
  assert.equal(applyActivity(activity, events[2] as OcEvent), activity);
});

const WHERE =
  "from agent openmuse-dev--topic-worker (session 829d8574-db27-1e26-cf30-a4a2cca65e0d, turn 5be49935-0ea7-4996-b584-84221dd31e86) at 2026-09-11T00:00:00.000Z";

test("delivered outcomes are recognised by the platform's input text", () => {
  const completed = parseOutcome(
    `Outcome event turn.completed ${WHERE}.\nResult:\nTopic: Workshop demo\nAll verified.`,
  );
  assert.deepEqual(completed, {
    status: "completed",
    agentId: "openmuse-dev--topic-worker",
    sessionId: "829d8574-db27-1e26-cf30-a4a2cca65e0d",
    turnId: "5be49935-0ea7-4996-b584-84221dd31e86",
    occurredAt: "2026-09-11T00:00:00.000Z",
    body: "Topic: Workshop demo\nAll verified.",
    truncated: false,
  });
  const truncated = parseOutcome(`Outcome event turn.completed ${WHERE}.\nResult (truncated):\nlong`);
  assert.equal(truncated?.truncated, true);
  assert.equal(truncated?.body, "long");
  const failed = parseOutcome(`Outcome event turn.failed ${WHERE} (tool_failed).\nError: sandbox died`);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.reason, "tool_failed");
  assert.equal(failed?.detail, "sandbox died");
  assert.equal(failed?.body, "");
  const cancelled = parseOutcome(`Outcome event turn.cancelled ${WHERE} (interrupted).`);
  assert.equal(cancelled?.status, "cancelled");
  assert.equal(cancelled?.reason, "interrupted");
  const bare = parseOutcome(`Outcome event turn.cancelled ${WHERE}.`);
  assert.equal(bare?.status, "cancelled");
  assert.equal(bare?.reason, undefined);
  assert.equal(parseOutcome("hello"), null);
  assert.equal(parseOutcome("Outcome event turn.completed from someone"), null);
});

test("the fallback return path writes the same text the browser and the coordinator parse", () => {
  testEnv();
  const events: OcEvent[] = [
    { seq: 1, type: "turn.started", turnId: "wt", timestamp: "2026-09-11T00:00:00.000Z", data: {} },
    {
      seq: 2,
      type: "message.completed",
      turnId: "wt",
      timestamp: "2026-09-11T00:00:05.000Z",
      data: { text: "Topic: X\ndone" },
    },
    { seq: 3, type: "turn.completed", turnId: "wt", timestamp: "2026-09-11T00:00:06.000Z", data: {} },
    {
      seq: 4,
      type: "turn.failed",
      turnId: "other",
      timestamp: "2026-09-11T00:00:07.000Z",
      data: { code: "tool_failed", message: "boom" },
    },
  ];
  const completed = outcomeOf(events, "ws", "wt");
  assert.ok(completed);
  const card = parseOutcome(outcomeText(completed));
  assert.deepEqual(card, {
    status: "completed",
    agentId: "w",
    sessionId: "ws",
    turnId: "wt",
    occurredAt: "2026-09-11T00:00:06.000Z",
    body: "Topic: X\ndone",
    truncated: false,
  });
  const failed = outcomeOf(events, "ws", "other");
  assert.ok(failed);
  const failedCard = parseOutcome(outcomeText(failed));
  assert.equal(failedCard?.status, "failed");
  assert.equal(failedCard?.reason, "tool_failed");
  assert.equal(failedCard?.detail, "boom");
  assert.equal(outcomeOf(events, "ws", "running"), null);
});
