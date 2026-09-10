import assert from "node:assert/strict";
import { test } from "node:test";
import { reduceEvents, turnResult } from "../lib/events/messages";
import { composeInput, stripRecall } from "../lib/memory/envelope";
import { outcomeMessage } from "../lib/return-path/watcher";

const input = composeInput({ profile: { id: "owner", text: "x" } }, "Hello there");

test("the recall block is stripped from the owner's message", () => {
  assert.equal(stripRecall(input), "Hello there");
  assert.equal(stripRecall("plain"), "plain");
});

test("events reduce to messages, activity and turn state", () => {
  const timeline = reduceEvents([
    { seq: 1, type: "message.received", turnId: "t1", data: { input } },
    { seq: 2, type: "turn.started", turnId: "t1", data: {} },
    { seq: 3, type: "message.delta", turnId: "t1", data: { text: "Hi" } },
    { seq: 4, type: "message.delta", turnId: "t1", data: { text: " back" } },
    { seq: 5, type: "tool.started", turnId: "t1", data: { tool: "shell", input: { command: "ls" } } },
    { seq: 6, type: "message.completed", turnId: "t1", data: { text: "Hi back" } },
    { seq: 7, type: "turn.completed", turnId: "t1", data: {} },
  ]);
  assert.deepEqual(timeline.messages.map((m) => [m.role, m.text, m.streaming ?? false]), [["owner", "Hello there", false], ["assistant", "Hi back", false]]);
  assert.equal(timeline.running, false);
  assert.equal(timeline.cursor, 7);
  assert.deepEqual(timeline.activity.map((a) => a.kind), ["turn.started", "tool.started", "turn.completed"]);
});

test("outcome reports render as app messages and carry the worker turn", () => {
  const message = outcomeMessage({ topicId: "t", title: "T", workerSessionId: "s", workerTurnId: "wt", status: "completed", text: "done" });
  assert.match(message, /^\[topic outcome\] \{/);
  const timeline = reduceEvents([{ seq: 1, type: "message.received", turnId: "c1", data: { input: composeInput({}, message) } }]);
  assert.equal(timeline.messages[0].role, "app");
  assert.equal(turnResult([
    { seq: 1, type: "message.completed", turnId: "wt", data: { text: "final" } },
    { seq: 2, type: "turn.failed", turnId: "wt", data: { message: "boom" } },
  ], "wt").status, "failed");
});
