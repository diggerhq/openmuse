// One pass of the interim return path, for hosts whose scheduler calls in
// over HTTP (Cloudflare uses the cron trigger in src/server.ts instead).
// Accepts the owner cookie or the agent secret.
import { createFileRoute } from "@tanstack/react-router";
import { ownerSession, requireAgent } from "@/lib/auth/guard";
import { failure } from "@/lib/http/json";
import { tick } from "@/lib/return-path";

export const Route = createFileRoute("/api/internal/return-path/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await ownerSession(request)) && requireAgent(request))
          return Response.json({ error: "unauthorized" }, { status: 401 });
        try {
          return Response.json({ delivered: await tick() });
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
