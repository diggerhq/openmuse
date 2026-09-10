import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { conversationHistory } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  try {
    const { sessionId, timeline } = await conversationHistory();
    return NextResponse.json({ sessionId, timeline });
  } catch (error) {
    return failure(error);
  }
}
