import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { stopCoordinator } from "@/lib/conversation/service";
import { failure } from "@/lib/http/json";

export async function POST(request: Request) {
  const guard = requireOwner(request, { mutation: true });
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await stopCoordinator(), { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
