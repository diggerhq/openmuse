import { type OwnerSession, SESSION_COOKIE, verifySession } from "@/lib/auth/cookie";
import { constantTimeEquals } from "@/lib/crypto";
import { env } from "@/lib/env";

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function ownerSession(request: Request): Promise<OwnerSession | null> {
  return verifySession(cookie(request, SESSION_COOKIE));
}

// Browser requests that change state must come from this app's own origin
// (Origin or Sec-Fetch-Site) and carry the CSRF token bound to the cookie.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin) {
    try {
      const requestOrigin = new URL(request.url).origin;
      const allowed = new Set([env().appOrigin, requestOrigin]);
      return allowed.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }
  return site === "same-origin" || site === "none";
}

export type Guard = { ok: true; session: OwnerSession } | { ok: false; response: Response };

export async function requireOwner(request: Request, options: { mutation?: boolean } = {}): Promise<Guard> {
  const session = await ownerSession(request);
  if (!session) return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  if (options.mutation) {
    if (!sameOrigin(request)) return { ok: false, response: Response.json({ error: "bad_origin" }, { status: 403 }) };
    const token = request.headers.get("x-csrf-token") ?? "";
    if (!token || !constantTimeEquals(token, session.csrf)) {
      return { ok: false, response: Response.json({ error: "csrf" }, { status: 403 }) };
    }
  }
  return { ok: true, session };
}

// Agent-facing routes: the installation secret presented by the managed
// connection as a bearer token. OpenComputer attaches it; agent code never sees it.
export function requireAgent(request: Request): Response | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !constantTimeEquals(token, env().agentSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function clientAddress(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}
