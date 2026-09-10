import { defineTool, type DataValue } from "@opencomputer/agent";
import { call } from "./app.js";

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export const startTopic = defineTool({
  name: "start_topic",
  description: "Delegate work to a topic worker. Pass topicId to continue an existing topic from the overview, or title to open a new one; never both. The task is queued as one turn on the topic's ongoing worker session and this returns immediately; the outcome arrives later as a [topic outcome] message. A refused result means the topic is archived or unknown.",
  input: {
    type: "object",
    properties: {
      topicId: { type: "string", description: "ID of an existing topic from the overview." },
      title: { type: "string", description: "Short title for a new topic, at most 80 characters." },
      task: { type: "string", description: "What the worker should do, with the concrete inputs it needs (repository URL, file names, constraints)." },
    },
    required: ["task"],
    additionalProperties: false,
  },
  async run({ input, sessionId, messageId, signal }) {
    const task = typeof input.task === "string" ? input.task.trim() : "";
    const topicId = typeof input.topicId === "string" ? input.topicId.trim() : "";
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!task || task.length > 8000) throw new Error("task must be 1-8000 characters");
    if (Boolean(topicId) === Boolean(title)) throw new Error("Pass exactly one of topicId or title");
    if (title.length > 80 || /[\r\n]/.test(title)) throw new Error("title must be one line of at most 80 characters");
    // The platform does not expose the tool-call id yet; the invocation id is
    // derived from the message and arguments so a transport retry converges.
    const invocationId = await digest(JSON.stringify([sessionId, messageId, topicId, title, task]));
    const result = await call("POST", "/api/agent/start-topic", {
      invocationId, task, ...(topicId ? { topicId } : { title }),
    }, signal);
    if (result.status === 200 || result.status === 201 || result.status === 409) {
      return result.json as DataValue;
    }
    return { status: "failed", httpStatus: result.status } as DataValue;
  },
});
