// The owner's profile notes for the Main panel. Writes stay with the
// coordinator (memory_save on its profile binding).
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { PROFILE_DOCUMENT } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";
import { memory } from "@/lib/memory";

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        try {
          return Response.json({ document: await memory.get("profile", PROFILE_DOCUMENT) });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
