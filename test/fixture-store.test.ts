import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { fixtureStore } from "@/lib/memory/fixture-store";
import { readState, updateState } from "@/lib/state/store";
import { testEnv } from "./env";

beforeAll(() => testEnv());

test("seeds from fixtures/notes and enforces compare-and-swap", async () => {
  const profile = await fixtureStore.get("profile", "owner");
  assert.ok(profile?.text.includes("Node 22"));
  const topics = await fixtureStore.list("topics");
  assert.deepEqual(topics.map((t) => t.id).sort(), ["conference-budget", "workshop-demo"]);

  const workshop = topics.find((t) => t.id === "workshop-demo");
  assert.ok(workshop);
  const first = await fixtureStore.replace("topics", "workshop-demo", { text: "v1" }, workshop.revision, {
    kind: "agent",
    sessionId: "s1",
  });
  assert.equal(first.status, "saved");
  const stale = await fixtureStore.replace("topics", "workshop-demo", { text: "v2" }, "not-current", { kind: "owner" });
  assert.equal(stale.status, "conflict");
  if (stale.status === "conflict") assert.equal(stale.text, "v1");

  const frozen = await fixtureStore.patch(
    "topics",
    "workshop-demo",
    { agentWrites: "disabled" },
    first.status === "saved" ? first.revision : "",
  );
  assert.equal(frozen.status, "saved");
  const rejected = await fixtureStore.replace(
    "topics",
    "workshop-demo",
    { text: "v3" },
    frozen.status === "saved" ? frozen.revision : "",
    { kind: "agent", sessionId: "s1" },
  );
  assert.deepEqual(rejected, { status: "rejected", reason: "agent_writes_disabled" });
  const owner = await fixtureStore.replace(
    "topics",
    "workshop-demo",
    { text: "v3" },
    frozen.status === "saved" ? frozen.revision : "",
    { kind: "owner" },
  );
  assert.equal(owner.status, "saved");

  const big = await fixtureStore.replace(
    "topics",
    "workshop-demo",
    { text: "x".repeat(9000) },
    owner.status === "saved" ? owner.revision : "",
    { kind: "owner" },
  );
  assert.equal(big.status, "rejected");
  assert.equal((await fixtureStore.create("topics", "workshop-demo", { title: "dup", text: "" })).status, "exists");
  const created = await fixtureStore.create("topics", "new-one", { title: "New", text: "" });
  assert.equal(created.status, "created");
  const renamed = await fixtureStore.patch(
    "topics",
    "new-one",
    { title: "Renamed" },
    created.status === "created" ? created.document.revision : "",
  );
  assert.equal(renamed.status, "saved");
  assert.equal((await fixtureStore.get("topics", "new-one"))?.title, "Renamed");
});

test("the state store serializes read-modify-write", async () => {
  assert.deepEqual((await readState()).topics, {});
  await Promise.all(
    ["a", "b", "c"].map((id) =>
      updateState((state) => ({
        state: {
          ...state,
          topics: {
            ...state.topics,
            [id]: {
              id,
              title: id,
              createdAt: "now",
              archived: false,
              previousWorkerSessionIds: [],
              invocations: {},
              recalledRevision: {},
            },
          },
        },
        result: undefined,
      })),
    ),
  );
  assert.deepEqual(Object.keys((await readState()).topics).sort(), ["a", "b", "c"]);
});
