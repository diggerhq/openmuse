// Rename from the sidebar's context menu: the title lives on the document,
// so it is a compare-and-swap patch like archive.
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { utf8ByteLength } from "@/lib/crypto";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid, TITLE_MAX_BYTES } from "@/lib/memory";
import { renameTopic } from "@/lib/topics/service";

export const Route = createFileRoute("/api/topics/$id/rename")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        if (!documentIdValid(params.id)) return bad("invalid topic id");
        const body = await readJson<{ title?: string; revision?: string }>(request);
        const title = typeof body?.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
        if (
          !title ||
          title.length > 80 ||
          utf8ByteLength(title) > TITLE_MAX_BYTES ||
          typeof body?.revision !== "string"
        ) {
          return bad("title (1-80 characters) and revision are required");
        }
        try {
          const result = await renameTopic(params.id, title, body.revision);
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
