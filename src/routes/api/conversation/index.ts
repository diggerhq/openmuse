// The coordinator session the browser attaches to. History and live turns
// come through /api/sessions/<id>/*.
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { coordinatorSessionId } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";

export const Route = createFileRoute("/api/conversation/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        try {
          return Response.json({ sessionId: await coordinatorSessionId() });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
