import { defineTool, type DataValue } from "@opencomputer/agent";
import { call } from "./app.js";

// Stand-in for the platform's memory_save on this topic's document. The app
// resolves the expected revision from what it last recalled into this
// session, so the model never supplies one. Deleted when project memory lands.
export const saveNotes = defineTool({
  name: "save_notes",
  description: "Replace this topic's saved notes with the given text and a one-line summary. Save only continuing knowledge: constraints, sources, tested revisions and commands, decisions, unfinished work. Send the whole document. The result is saved, conflict (with the current text to reconcile and save again) or rejected.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "Complete replacement text, at most 8192 bytes." },
      summary: { type: "string", description: "One line, at most 240 bytes, shown in the topic overview." },
    },
    required: ["text"],
    additionalProperties: false,
  },
  async run({ input, sessionId, signal }) {
    const text = typeof input.text === "string" ? input.text : "";
    const summary = typeof input.summary === "string" ? input.summary : undefined;
    const result = await call("PUT", "/api/agent/notes", { text, summary, sessionId }, signal);
    if (result.status === 200) return result.json as DataValue;
    return { status: "failed", httpStatus: result.status };
  },
});
