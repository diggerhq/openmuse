import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { memoryBackend } from "@/lib/memory";

export async function GET(request: Request) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ csrf: guard.session.csrf, exp: guard.session.exp, memoryBackend: memoryBackend() });
}
