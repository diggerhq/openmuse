import assert from "node:assert/strict";
import { test } from "vitest";
import { initialNotes, isDirty, type NotesBase, notesReducer } from "@/lib/client/notes-machine";

const base: NotesBase = {
  text: "one",
  summary: "s",
  revision: "r1",
  updatedAt: "2026-09-10T10:00:00.000Z",
  writer: { kind: "agent", sessionId: "x" },
};

test("saved is only shown after the server confirmed", () => {
  let state = initialNotes(base);
  assert.equal(isDirty(state), false);
  state = notesReducer(state, { type: "edit", text: "two" });
  assert.equal(isDirty(state), true);
  assert.equal(state.status, "idle");
  state = notesReducer(state, { type: "save" });
  assert.equal(state.status, "saving");
  state = notesReducer(state, { type: "saved", revision: "r2", at: 1_000 });
  assert.equal(state.status, "saved");
  assert.equal(state.base.revision, "r2");
  assert.equal(state.base.text, "two");
  assert.equal(state.base.writer.kind, "owner");
  assert.equal(isDirty(state), false);
});

test("a conflict keeps the draft and shows the server's text", () => {
  let state = notesReducer(initialNotes(base), { type: "edit", text: "mine" });
  state = notesReducer(state, { type: "save" });
  state = notesReducer(state, { type: "conflict", text: "theirs", summary: "s2", revision: "r9" });
  assert.equal(state.status, "conflict");
  assert.equal(state.draft.text, "mine");
  assert.equal(state.conflict?.text, "theirs");
  // Take theirs: the editor now holds the server's text and revision.
  const taken = notesReducer(state, { type: "take-server" });
  assert.equal(taken.draft.text, "theirs");
  assert.equal(taken.base.revision, "r9");
  assert.equal(isDirty(taken), false);
  // Keep mine: the draft stays, the next save targets the server's revision.
  const kept = notesReducer(state, { type: "keep-mine" });
  assert.equal(kept.draft.text, "mine");
  assert.equal(kept.base.revision, "r9");
  assert.equal(kept.base.text, "theirs");
  assert.equal(isDirty(kept), true);
  assert.equal(kept.status, "idle");
});

test("server changes never overwrite an unsaved draft", () => {
  const newer: NotesBase = { ...base, text: "server", revision: "r2", updatedAt: "2026-09-10T11:00:00.000Z" };
  // Clean editor adopts the server's text.
  const clean = notesReducer(initialNotes(base), { type: "loaded", base: newer });
  assert.equal(clean.draft.text, "server");
  // Dirty editor keeps the draft and notes that it is behind.
  const dirty = notesReducer(notesReducer(initialNotes(base), { type: "edit", text: "mine" }), {
    type: "loaded",
    base: newer,
  });
  assert.equal(dirty.draft.text, "mine");
  assert.equal(dirty.behind?.revision, "r2");
  assert.equal(notesReducer(dirty, { type: "discard" }).draft.text, "server");
  // A stale fetch after a newer save is ignored.
  const saved = notesReducer(
    notesReducer(notesReducer(initialNotes(base), { type: "edit", text: "mine" }), { type: "save" }),
    { type: "saved", revision: "r3", at: Date.parse("2026-09-10T12:00:00.000Z") },
  );
  const stale = notesReducer(saved, { type: "loaded", base: newer });
  assert.equal(stale.base.revision, "r3");
  // Reloading the same revision is a no-op.
  assert.equal(notesReducer(saved, { type: "loaded", base: saved.base }), saved);
});

test("a failed save reports the error and keeps the draft editable", () => {
  let state = notesReducer(notesReducer(initialNotes(base), { type: "edit", text: "mine" }), { type: "save" });
  state = notesReducer(state, { type: "failed", error: "Too long" });
  assert.equal(state.status, "error");
  assert.equal(state.error, "Too long");
  state = notesReducer(state, { type: "edit", text: "mine again" });
  assert.equal(state.status, "idle");
  assert.equal(state.error, undefined);
});
