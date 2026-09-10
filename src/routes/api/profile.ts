// The owner's profile notes for the Main panel: the one read route the
// redesign added. Writes stay with the coordinator (save_profile).
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { failure } from "@/lib/http/json";
import { memory } from "@/lib/memory";

export const Route = createFileRoute("/api/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        try {
          return Response.json({ document: await memory().get("profile", "owner") });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
