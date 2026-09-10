// Stand-in for memory_save on the profile document from the coordinator.
import { NextResponse } from "next/server";
import { requireAgent } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { agentSaveProfile } from "@/lib/topics/service";

export async function PUT(request: Request) {
  const denied = requireAgent(request);
  if (denied) return denied;
  const body = await readJson<{ text?: string; sessionId?: string }>(request);
  if (typeof body?.text !== "string" || typeof body.sessionId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(body.sessionId)) return bad("text and sessionId are required");
  try {
    return NextResponse.json(await agentSaveProfile(body.sessionId, body.text));
  } catch (error) {
    return failure(error);
  }
}
