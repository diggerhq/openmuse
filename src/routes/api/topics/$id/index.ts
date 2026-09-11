import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { topicDetail } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/$id/")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        try {
          const detail = await topicDetail(params.id);
          return detail ? Response.json(detail) : bad("not_found", 404);
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
