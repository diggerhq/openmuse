import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { env } from "@/lib/env";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        return Response.json({
          csrf: guard.session.csrf,
          exp: guard.session.exp,
          environment: env().environment,
        });
      },
    },
  },
});
