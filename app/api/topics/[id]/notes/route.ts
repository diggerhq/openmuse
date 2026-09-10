import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { ownerEditNotes } from "@/lib/topics/service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  const body = await readJson<{ text?: string; summary?: string; revision?: string }>(request);
  if (typeof body?.text !== "string" || typeof body.revision !== "string") return bad("text and revision are required");
  if (body.summary !== undefined && typeof body.summary !== "string") return bad("summary must be a string");
  try {
    const result = await ownerEditNotes(id, { text: body.text, ...(body.summary !== undefined ? { summary: body.summary } : {}) }, body.revision);
    return NextResponse.json(result, { status: result.status === "saved" ? 200 : result.status === "conflict" ? 409 : 422 });
  } catch (error) {
    return failure(error);
  }
}
