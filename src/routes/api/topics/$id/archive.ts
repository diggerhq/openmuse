import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { setArchived } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/$id/archive")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        const body = await readJson<{ archived?: boolean; revision?: string }>(request);
        if (typeof body?.archived !== "boolean" || typeof body.revision !== "string")
          return bad("archived and revision are required");
        try {
          const result = await setArchived(params.id, body.archived, body.revision);
          return Response.json(result, {
            status: result.status === "saved" ? 200 : result.status === "conflict" ? 409 : 422,
          });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
