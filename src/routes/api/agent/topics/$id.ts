// Stand-in for memory_read on the topics collection, for the coordinator.
import { createFileRoute } from "@tanstack/react-router";
import { requireAgent } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { topicDetail } from "@/lib/topics/service";

export const Route = createFileRoute("/api/agent/topics/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = requireAgent(request);
        if (denied) return denied;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        try {
          const detail = await topicDetail(params.id);
          if (!detail) return bad("not_found", 404);
          const { document, topic } = detail;
          return Response.json({
            id: document.id,
            title: document.title,
            summary: document.summary,
            text: document.text,
            revision: document.revision,
            updatedAt: document.updatedAt,
            agentWrites: document.agentWrites,
            archived: topic.archived,
            work: topic.work ?? null,
          });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
