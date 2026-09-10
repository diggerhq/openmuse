import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { failure } from "@/lib/http/json";
import { listTopics } from "@/lib/topics/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = requireOwner(request);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ topics: await listTopics() });
  } catch (error) {
    return failure(error);
  }
}
