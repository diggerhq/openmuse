import { NextResponse } from "next/server";

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 256 * 1024): Promise<T | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) return null;
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status;
  console.error(JSON.stringify({ level: "error", event: "route_failed", message }));
  return NextResponse.json({ error: message }, { status: typeof status === "number" && status >= 400 && status < 600 ? status : 500 });
}
