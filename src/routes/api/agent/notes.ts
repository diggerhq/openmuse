// Stand-in for memory_save from a topic worker. The caller is identified by
// its session id; the expected revision is what the app recalled for it.
import { createFileRoute } from "@tanstack/react-router";
import { requireAgent } from "@/lib/auth/guard";
import { bad, failure, readJson } from "@/lib/http/json";
import { agentSaveNotes } from "@/lib/topics/service";

export const Route = createFileRoute("/api/agent/notes")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const denied = requireAgent(request);
        if (denied) return denied;
        const body = await readJson<{ text?: string; summary?: string; sessionId?: string }>(request);
        if (
          typeof body?.text !== "string" ||
          typeof body.sessionId !== "string" ||
          !/^[A-Za-z0-9-]{8,64}$/.test(body.sessionId)
        ) {
          return bad("text and sessionId are required");
        }
        if (body.summary !== undefined && typeof body.summary !== "string") return bad("summary must be a string");
        try {
          return Response.json(
            await agentSaveNotes(body.sessionId, {
              text: body.text,
              ...(body.summary !== undefined ? { summary: body.summary } : {}),
            }),
          );
        } catch (error) {
          return failure(error);
        }
      },
    },
  },
});
