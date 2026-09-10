// The three routes @opencomputer/react's attach mode needs, under the owner
// cookie and the CSRF check, for sessions this installation owns:
//   GET  /api/sessions/<id>/events?after=<seq>  the durable log from a cursor
//   POST /api/sessions/<id>/turns               { input, idempotencyKey } -> { turnId }
//   POST /api/sessions/<id>/interrupt           stop the running turn
// Turns are not forwarded raw: the app composes the recall projection into
// the input and records what each session saw (memory/recall.ts), and the
// events route strips that projection back out of message.received so the
// browser only ever sees what the owner wrote. Both go away when memory
// bindings land.
import { createFileRoute } from "@tanstack/react-router";
import { requireOwner } from "@/lib/auth/guard";
import { sendOwnerMessage, stopCoordinator } from "@/lib/conversation/service";
import { bad, failure, readJson } from "@/lib/http/json";
import { stripRecall } from "@/lib/memory/envelope";
import { oc } from "@/lib/oc/client";
import { interruptSession } from "@/lib/oc/sessions";
import { continueTopic, STOP_WORKER, sessionRole } from "@/lib/topics/service";

const SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;

export const Route = createFileRoute("/api/sessions/$id/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const guard = await requireOwner(request);
        if (!guard.ok) return guard.response;
        if (params.action !== "events" || !SESSION_ID.test(params.id)) return bad("not_found", 404);
        if (!(await sessionRole(params.id))) return bad("not_found", 404);
        const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
        try {
          const events = await oc.events(params.id, Number.isFinite(after) && after > 0 ? after : 0, request.signal);
          return Response.json({
            events: events.map((event) =>
              event.type === "message.received" && typeof event.data.input === "string"
                ? { ...event, data: { ...event.data, input: stripRecall(event.data.input) } }
                : event,
            ),
          });
        } catch (error) {
          return failure(error);
        }
      },
      POST: async ({ request, params }) => {
        const guard = await requireOwner(request, { mutation: true });
        if (!guard.ok) return guard.response;
        if (!SESSION_ID.test(params.id)) return bad("not_found", 404);
        const role = await sessionRole(params.id);
        if (!role) return bad("not_found", 404);
        try {
          if (params.action === "interrupt") {
            if (role.kind === "coordinator") return Response.json(await stopCoordinator(), { status: 202 });
            return Response.json(await interruptSession(params.id, STOP_WORKER), { status: 202 });
          }
          if (params.action !== "turns") return bad("not_found", 404);
          const body = await readJson<{ input?: string; idempotencyKey?: string }>(request, 64 * 1024);
          const text = typeof body?.input === "string" ? body.input.trim() : "";
          if (!text || text.length > 32_000) return bad("input must be 1-32000 characters");
          const key =
            typeof body?.idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(body.idempotencyKey)
              ? body.idempotencyKey
              : undefined;
          if (role.kind === "coordinator") return Response.json(await sendOwnerMessage(text, key), { status: 202 });
          if (!role.current) return bad("This worker session has ended; the next task starts a new one.", 409);
          return Response.json(await continueTopic(role.topicId, text, key), { status: 202 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "not_found") return bad("not_found", 404);
          if (message === "archived") return bad("archived", 409);
          return failure(error);
        }
      },
    },
  },
});
