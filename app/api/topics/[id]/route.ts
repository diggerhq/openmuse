import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { topicDetail } from "@/lib/topics/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  try {
    const detail = await topicDetail(id);
    return detail ? NextResponse.json(detail) : bad("not_found", 404);
  } catch (error) {
    return failure(error);
  }
}
