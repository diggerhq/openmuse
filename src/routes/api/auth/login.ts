import { createFileRoute } from "@tanstack/react-router";
import {
  constantTimeEquals,
  cookieAttributes,
  issueSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/cookie";
import { clientAddress, sameOrigin } from "@/lib/auth/guard";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { readJson } from "@/lib/http/json";
import { installationOrigin, registerInstallation } from "@/lib/oc/installation";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return Response.json({ error: "bad_origin" }, { status: 403 });
        const client = clientAddress(request);
        if (!loginAllowed(client))
          return Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "900" } });
        const body = await readJson<{ secret?: string }>(request, 4096);
        const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
        if (!secret || !constantTimeEquals(secret, env().ownerSecret)) {
          recordLoginFailure(client);
          return Response.json({ error: "invalid_secret" }, { status: 401 });
        }
        clearLoginFailures(client);
        // The owner signing in is the installation claiming its origin.
        const installation = await registerInstallation(installationOrigin(request));
        const { value, session } = await issueSession();
        return Response.json(
          { ok: true, csrf: session.csrf, exp: session.exp, installation },
          { headers: { "set-cookie": `${SESSION_COOKIE}=${value}; ${cookieAttributes(SESSION_TTL_SECONDS)}` } },
        );
      },
    },
  },
});
