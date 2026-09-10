// One pass of the interim return path, for hosts without a resident process
// (a Vercel cron can call this). Accepts the owner cookie or the agent secret.
import { NextResponse } from "next/server";
import { ownerSession, requireAgent } from "@/lib/auth/guard";
import { failure } from "@/lib/http/json";
import { tick } from "@/lib/return-path/watcher";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!ownerSession(request) && requireAgent(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ delivered: await tick() });
  } catch (error) {
    return failure(error);
  }
}
