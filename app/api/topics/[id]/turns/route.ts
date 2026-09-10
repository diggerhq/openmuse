import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { continueTopic } from "@/lib/topics/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  const body = await readJson<{ text?: string }>(request, 64 * 1024);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 32_000) return bad("text must be 1-32000 characters");
  try {
    return NextResponse.json(await continueTopic(id, text), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "not_found") return bad("not_found", 404);
    if (message === "archived") return bad("archived", 409);
    return failure(error);
  }
}
