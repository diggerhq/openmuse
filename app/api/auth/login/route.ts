import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, constantTimeEquals, cookieAttributes, issueSession } from "@/lib/auth/cookie";
import { clientAddress, sameOrigin } from "@/lib/auth/guard";
import { clearLoginFailures, loginAllowed, recordLoginFailure } from "@/lib/auth/rate-limit";
import { readJson } from "@/lib/http/json";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "bad_origin" }, { status: 403 });
  const client = clientAddress(request);
  if (!loginAllowed(client)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "900" } });
  const body = await readJson<{ secret?: string }>(request, 4096);
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";
  if (!secret || !constantTimeEquals(secret, env().ownerSecret)) {
    recordLoginFailure(client);
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }
  clearLoginFailures(client);
  const { value, session } = issueSession();
  const response = NextResponse.json({ ok: true, csrf: session.csrf, exp: session.exp });
  response.headers.set("set-cookie", `${SESSION_COOKIE}=${value}; ${cookieAttributes(SESSION_TTL_SECONDS)}`);
  return response;
}
