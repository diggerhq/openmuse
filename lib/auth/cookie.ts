import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "om_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface OwnerSession {
  readonly iat: number;
  readonly exp: number;
  readonly csrf: string;
}

function sign(payload: string): string {
  return createHmac("sha256", env().cookieSecret).update(payload).digest("base64url");
}

export function issueSession(now = Date.now()): { value: string; session: OwnerSession } {
  const session: OwnerSession = {
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    csrf: randomBytes(24).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, session };
}

export function verifySession(value: string | undefined, now = Date.now()): OwnerSession | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const signature = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OwnerSession;
    if (typeof session.exp !== "number" || typeof session.csrf !== "string" || session.exp * 1000 < now) return null;
    return session;
  } catch {
    return null;
  }
}

export function cookieAttributes(maxAge: number): string {
  return [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAge}`, ...(env().secureCookies ? ["Secure"] : [])].join("; ");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
