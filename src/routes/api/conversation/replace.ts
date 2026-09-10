import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { replaceCoordinator } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";

export const Route = createFileRoute("/api/conversation/replace")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        try {
          return Response.json(await replaceCoordinator());
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
