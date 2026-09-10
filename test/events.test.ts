import assert from "node:assert/strict";
import { test } from "vitest";
import { applyActivity, emptyActivity, parseOutcome, turnResult } from "@/lib/events/messages";
import { composeInput, stripRecall } from "@/lib/memory/envelope";
import type { OcEvent } from "@/lib/oc/client";
import { outcomeMessage } from "@/lib/return-path";

const input = composeInput({ profile: { id: "owner", text: "x" } }, "Hello there");

test("the recall block is stripped from the owner's message", () => {
  assert.equal(stripRecall(input), "Hello there");
  assert.equal(stripRecall("plain"), "plain");
});

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

test("outcome reports parse into cards that link to the topic", () => {
  const message = outcomeMessage({
    topicId: "workshop-demo",
    title: "Workshop demo",
    workerSessionId: "s",
    workerTurnId: "wt",
    status: "failed",
    text: "done",
    detail: "boom",
  });
  assert.match(message, /^\[topic outcome\] \{/);
  const card = parseOutcome(message);
  assert.deepEqual(card, {
    topicId: "workshop-demo",
    title: "Workshop demo",
    status: "failed",
    detail: "boom",
    body: "done",
  });
  assert.equal(parseOutcome("hello"), null);
  assert.equal(
    turnResult(
      [
        { seq: 1, type: "message.completed", turnId: "wt", data: { text: "final" } },
        { seq: 2, type: "turn.failed", turnId: "wt", data: { message: "boom" } },
      ],
      "wt",
    ).status,
    "failed",
  );
});
