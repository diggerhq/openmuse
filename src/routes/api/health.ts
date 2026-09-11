// The health check every host polls (Docker HEALTHCHECK, Render, Railway,
// Fly, DigitalOcean). Cheap: no platform call, no store read. It fails only
// when the configuration is unusable, so a misconfigured deploy is refused by
// the host with the reason in its logs instead of serving a broken app. It
// names the installation so a caller can tell which one it reached (the
// end-to-end suite refuses to run against any but its own).
import { createFileRoute } from "@tanstack/react-router";
import { env } from "@/lib/env";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        try {
          const { stateStore, environment, installationId } = env();
          return Response.json(
            { ok: true, stateStore, environment, installationId },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Response.json(
            { ok: false, error: message },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
