import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { replaceWorker } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/$id/replace-worker")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        try {
          return Response.json(await replaceWorker(params.id));
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
