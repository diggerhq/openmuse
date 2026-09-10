import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { sendOwnerMessage } from "@/lib/conversation/service";
import { bad, failure, readJson } from "@/lib/http/json";

export async function POST(request: Request) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const body = await readJson<{ text?: string; idempotencyKey?: string }>(request, 64 * 1024);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 32_000) return bad("text must be 1-32000 characters");
  const key = typeof body?.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.idempotencyKey) ? body.idempotencyKey : undefined;
  try {
    return NextResponse.json(await sendOwnerMessage(text, key), { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
