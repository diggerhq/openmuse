import { requireOwner } from "@/lib/auth/guard";
import { coordinatorSessionId } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";
import { sessionEventStream } from "@/lib/http/sse";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
  try {
    return sessionEventStream(await coordinatorSessionId(), Number.isFinite(after) && after > 0 ? after : 0, request.signal);
  } catch (error) {
    return failure(error);
  }
}
