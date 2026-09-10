import { requireOwner } from "@/lib/auth/guard";
import { bad, failure } from "@/lib/http/json";
import { documentIdValid } from "@/lib/memory";
import { sessionEventStream } from "@/lib/http/sse";
import { readState } from "@/lib/state/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!documentIdValid(id)) return bad("invalid topic id");
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
  try {
    const sessionId = (await readState()).topics[id]?.workerSessionId;
    if (!sessionId) return bad("no worker session", 404);
    return sessionEventStream(sessionId, Number.isFinite(after) && after > 0 ? after : 0, request.signal);
  } catch (error) {
    return failure(error);
  }
}
