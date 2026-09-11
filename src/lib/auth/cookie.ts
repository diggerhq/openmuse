// The owner's signed session cookie: a base64url payload and an HMAC-SHA256
// signature over it, verified in constant time. Web Crypto only.
import { base64url, constantTimeEquals, fromBase64url, hmacSha256, randomBytes, utf8Bytes } from "@/lib/crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "om_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface OwnerSession {
  readonly iat: number;
  readonly exp: number;
  readonly csrf: string;
}

function sign(payload: string): Promise<string> {
  return hmacSha256(env().cookieSecret, payload);
}

export async function issueSession(now = Date.now()): Promise<{ value: string; session: OwnerSession }> {
  const session: OwnerSession = {
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    csrf: base64url(randomBytes(24)),
  };
  const payload = base64url(utf8Bytes(JSON.stringify(session)));
  return { value: `${payload}.${await sign(payload)}`, session };
}

export async function verifySession(value: string | undefined, now = Date.now()): Promise<OwnerSession | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  if (!constantTimeEquals(value.slice(dot + 1), await sign(payload))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as OwnerSession;
    if (typeof session.exp !== "number" || typeof session.csrf !== "string" || session.exp * 1000 < now) return null;
    return session;
  } catch {
    return null;
  }
}

export function cookieAttributes(maxAge: number): string {
  return ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`, ...(env().secureCookies ? ["Secure"] : [])].join(
    "; ",
  );
}

export { constantTimeEquals };
