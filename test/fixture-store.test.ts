import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.OPENMUSE_STATE_DIR = await mkdtemp(join(tmpdir(), "openmuse-"));
Object.assign(process.env, {
  OPENMUSE_COOKIE_SECRET: "c".repeat(40), OPENMUSE_OWNER_SECRET: "o".repeat(24), OPENMUSE_AGENT_SECRET: "a".repeat(40),
  OPENMUSE_INSTALLATION_ID: "test", OPENMUSE_APP_ORIGIN: "https://openmuse.test", OPENCOMPUTER_PROJECT_ID: "prj_test",
  OPENMUSE_COORDINATOR_AGENT: "c", OPENMUSE_WORKER_AGENT: "w", OPENCOMPUTER_API_KEY: "k",
});
const { fixtureStore } = await import("../lib/memory/fixture-store");

test("seeds from fixtures/notes and enforces compare-and-swap", async () => {
  const profile = await fixtureStore.get("profile", "owner");
  assert.ok(profile && profile.text.includes("Node 22"));
  const topics = await fixtureStore.list("topics");
  assert.deepEqual(topics.map((t) => t.id).sort(), ["conference-budget", "workshop-demo"]);

  const first = await fixtureStore.replace("topics", "workshop-demo", { text: "v1" }, topics.find((t) => t.id === "workshop-demo")!.revision, { kind: "agent", sessionId: "s1" });
  assert.equal(first.status, "saved");
  const stale = await fixtureStore.replace("topics", "workshop-demo", { text: "v2" }, "not-current", { kind: "owner" });
  assert.equal(stale.status, "conflict");
  if (stale.status === "conflict") assert.equal(stale.text, "v1");

  const frozen = await fixtureStore.patch("topics", "workshop-demo", { agentWrites: "disabled" }, first.status === "saved" ? first.revision : "");
  assert.equal(frozen.status, "saved");
  const rejected = await fixtureStore.replace("topics", "workshop-demo", { text: "v3" }, frozen.status === "saved" ? frozen.revision : "", { kind: "agent", sessionId: "s1" });
  assert.deepEqual(rejected, { status: "rejected", reason: "agent_writes_disabled" });
  const owner = await fixtureStore.replace("topics", "workshop-demo", { text: "v3" }, frozen.status === "saved" ? frozen.revision : "", { kind: "owner" });
  assert.equal(owner.status, "saved");

  const big = await fixtureStore.replace("topics", "workshop-demo", { text: "x".repeat(9000) }, owner.status === "saved" ? owner.revision : "", { kind: "owner" });
  assert.equal(big.status, "rejected");
  assert.equal((await fixtureStore.create("topics", "workshop-demo", { title: "dup", text: "" })).status, "exists");
  const created = await fixtureStore.create("topics", "new-one", { title: "New", text: "" });
  assert.equal(created.status, "created");
});
