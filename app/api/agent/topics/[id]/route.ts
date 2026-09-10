// Stand-in for memory_read on the topics collection, for the coordinator.
import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { topicDetail } from "@/lib/topics/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAgent(request);
  if (denied) return denied;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  try {
    const detail = await topicDetail(id);
    if (!detail) return bad("not_found", 404);
    const { document, topic } = detail;
    return NextResponse.json({
      id: document.id, title: document.title, summary: document.summary, text: document.text, revision: document.revision,
      updatedAt: document.updatedAt, agentWrites: document.agentWrites, archived: topic.archived, work: topic.work ?? null,
    });
  } catch (error) {
    return failure(error);
  }
}
