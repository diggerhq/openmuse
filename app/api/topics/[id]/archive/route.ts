import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { setArchived } from "@/lib/topics/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  const body = await readJson<{ archived?: boolean; revision?: string }>(request);
  if (typeof body?.archived !== "boolean" || typeof body.revision !== "string") return bad("archived and revision are required");
  try {
    const result = await setArchived(id, body.archived, body.revision);
    return NextResponse.json(result, { status: result.status === "saved" ? 200 : result.status === "conflict" ? 409 : 422 });
  } catch (error) {
    return failure(error);
  }
}
