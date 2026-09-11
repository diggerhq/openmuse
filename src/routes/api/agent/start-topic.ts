// Called by the coordinator's start_topic tool through the managed connection:
// the one agent-facing app route. Notes are read through the topics binding.
import { createFileRoute } from "@tanstack/react-router";
import { requireAgent } from "@/lib/auth/guard";
import { utf8ByteLength } from "@/lib/crypto";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { startTopic } from "@/lib/topics/service";

export const Route = createFileRoute("/api/agent/start-topic")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireAgent(request);
        if (denied) return denied;
        const body = await readJson<{ topicId?: string; title?: string; task?: string; invocationId?: string }>(
          request,
          64 * 1024,
        );
        const task = typeof body?.task === "string" ? body.task.trim() : "";
        const invocationId = typeof body?.invocationId === "string" ? body.invocationId : "";
        const topicId = typeof body?.topicId === "string" ? body.topicId.trim() : undefined;
        const title = typeof body?.title === "string" ? body.title.trim() : undefined;
        if (!task || task.length > 8000) return bad("task must be 1-8000 characters");
        if (!/^[a-f0-9]{16,64}$/.test(invocationId)) return bad("invocationId must be a hex digest");
        if (Boolean(topicId) === Boolean(title)) return bad("exactly one of topicId or title");
        if (topicId && !documentIdValid(topicId)) return bad("invalid topicId");
        if (title && (title.length > 80 || utf8ByteLength(title) > 240)) return bad("title too long");
        try {
          const result = await startTopic({ topicId, title, task, invocationId });
          return Response.json(result, { status: result.status === "started" ? (result.duplicate ? 200 : 201) : 409 });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
