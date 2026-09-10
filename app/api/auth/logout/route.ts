import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieAttributes } from "@/lib/auth/cookie";
import { requireOwner } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const response = NextResponse.json({ ok: true });
  response.headers.set("set-cookie", `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
  return response;
}
