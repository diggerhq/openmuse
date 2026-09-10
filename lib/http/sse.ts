// Server-sent events over the management API's polled event log: the browser
// holds one EventSource per session; the server polls OpenComputer and
// forwards new events until the client disconnects.
import { oc } from "@/lib/oc/client";

export function sessionEventStream(sessionId: string, after: number, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  let cursor = after;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { sessionId, after: cursor });
      let idle = 0;
      while (!signal.aborted) {
        try {
          const events = await oc.events(sessionId, cursor, AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
          for (const event of events) {
            if (event.seq <= cursor) continue;
            cursor = event.seq;
            send("event", event);
          }
          idle = events.length ? 0 : idle + 1;
        } catch (error) {
          if (signal.aborted) break;
          send("warning", { message: error instanceof Error ? error.message : String(error) });
          idle += 1;
        }
        if (idle % 10 === 9) controller.enqueue(encoder.encode(": keepalive\n\n"));
        await new Promise((resolve) => setTimeout(resolve, idle > 30 ? 3000 : 800));
      }
      try { controller.close(); } catch { /* closed */ }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
