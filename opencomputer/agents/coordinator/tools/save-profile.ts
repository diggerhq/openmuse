import { type DataValue, defineTool } from "@opencomputer/agent";
import { call } from "./app.js";

// Stand-in for the platform's memory_save on the profile document. Deleted
// when project memory lands.
export const saveProfile = defineTool({
  name: "save_profile",
  description:
    "Replace the owner profile notes with the given text. Use only for explicit, lasting owner preferences (tools, versions, style, constraints); keep the whole document, not just the new line. The result is saved, conflict (with the current text to reconcile) or rejected.",
  input: {
    type: "object",
    properties: { text: { type: "string", description: "Complete replacement text, at most 4096 bytes." } },
    required: ["text"],
    additionalProperties: false,
  },
  async run({ input, sessionId, signal }) {
    const text = typeof input.text === "string" ? input.text : "";
    const result = await call("PUT", "/api/agent/profile", { text, sessionId }, signal);
    if (result.status === 200) return result.json as DataValue;
    return { status: "failed", httpStatus: result.status };
  },
});
