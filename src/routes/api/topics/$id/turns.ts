// A task for a topic that has no usable worker session yet: the app admits
// the turn and (re)creates the session. Topics with a live session send
// through /api/sessions/<id>/turns instead.
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { continueTopic } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/$id/turns")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        const body = await readJson<{ text?: string }>(request, 64 * 1024);
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text || text.length > 32_000) return bad("text must be 1-32000 characters");
        try {
          return Response.json(await continueTopic(params.id, text), { status: 202 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "not_found") return bad("not_found", 404);
          if (message === "archived") return bad("archived", 409);
          return failure(error);
        }
      },
    },
  },
});
