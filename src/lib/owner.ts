// The signed-in owner's context for the app routes, read on the server from
// the request cookie during navigation. Nothing secret crosses to the
// browser: the CSRF token is bound to the cookie the browser already holds.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ownerSession } from "@/lib/auth/guard";
import { env } from "@/lib/env";

export interface OwnerContext {
  readonly csrf: string;
  readonly environment: "development" | "production";
  /** Where a session can be inspected on the platform: `${sessionLinkBase}/${sessionId}`. */
  readonly sessionLinkBase: string;
}

export const getOwnerContext = createServerFn({ method: "GET" }).handler(async (): Promise<OwnerContext | null> => {
  const session = await ownerSession(getRequest());
  if (!session) return null;
  const { environment, apiUrl, projectId } = env();
  return {
    csrf: session.csrf,
    environment,
    sessionLinkBase: `${apiUrl}/projects/${encodeURIComponent(projectId)}/sessions`,
  };
});
