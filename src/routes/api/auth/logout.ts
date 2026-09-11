import { createFileRoute } from "@tanstack/react-router";
import { cookieAttributes, SESSION_COOKIE } from "@/lib/auth/cookie";
import { requireOwner } from "@/lib/auth/guard";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        return Response.json({ ok: true }, { headers: { "set-cookie": `${SESSION_COOKIE}=; ${cookieAttributes(0)}` } });
      },
    },
  },
});
