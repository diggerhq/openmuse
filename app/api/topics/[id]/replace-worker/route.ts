import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { replaceWorker } from "@/lib/topics/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  try {
    return NextResponse.json(await replaceWorker(id));
  } catch (error) {
    return failure(error);
  }
}
