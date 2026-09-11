import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { failure } from "@/lib/http/json";
import { listTopics } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        try {
          return Response.json({ topics: await listTopics() });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
