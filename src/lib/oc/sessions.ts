// Session lifecycle over the management API: create-or-reuse by key with
// its memory bindings, queue a turn (resuming a suspended microVM first),
// interrupt.
import type { MemoryBindings } from "@opencomputer/sdk";
import { env } from "@/lib/env";
import { OcError, type OcSession, oc } from "@/lib/oc/client";

let deploymentCache: { at: number; ids: Record<string, string> } | undefined;

// The development deployment id of each agent; part of the session key so a
// redeploy admits a fresh session instead of a 409 on the old key.
export async function activeDeploymentId(agent: string): Promise<string> {
  if (!deploymentCache || Date.now() - deploymentCache.at > 30_000) {
    const { project } = await oc.project();
    const ids: Record<string, string> = {};
    for (const environment of project.environments) {
      if (environment.name === env().environment && environment.activeDeploymentId)
        ids[environment.agentId] = environment.activeDeploymentId;
    }
    deploymentCache = { at: Date.now(), ids };
  }
  const id = deploymentCache.ids[agent];
  if (!id) throw new Error(`Agent ${agent} has no ${env().environment} deployment; run npm run setup`);
  return id;
}

// The bindings are part of the session's identity under its key: the same
// key with different bindings is a 409, like a different deployment.
export async function createOrReuseSession(
  agent: string,
  key: string,
  memory: MemoryBindings,
): Promise<{ id: string; created: boolean }> {
  const idempotencyKey = `openmuse/${env().installationId}/${key}`;
  try {
    const result = await oc.createSession(agent, idempotencyKey, memory);
    return { id: result.session.id, created: result.created };
  } catch (error) {
    if (error instanceof OcError && error.status === 409) {
      throw new Error(
        `Session key ${key} was already used with another deployment or other memory bindings (${error.code})`,
      );
    }
    throw error;
  }
}

export function sessionUsable(session: OcSession | null): boolean {
  if (!session) return false;
  return session.status !== "ended" && session.microvmState !== "terminated";
}

export async function readSession(id: string): Promise<OcSession | null> {
  try {
    return await oc.session(id);
  } catch (error) {
    if (error instanceof OcError && error.status === 404) return null;
    throw error;
  }
}

export async function queueTurn(
  sessionId: string,
  input: string,
  idempotencyKey: string,
  mode: "queue" | "interrupt" = "queue",
) {
  const session = await readSession(sessionId);
  if (!session) throw new OcError(404, "session_not_found", "Session not found");
  if (session.status === "ended") throw new OcError(409, "session_ended", "Session has ended");
  if (session.executionMode !== "workerd" && session.microvmState === "suspended") {
    await oc.resume(sessionId);
  }
  return oc.turn(sessionId, input, idempotencyKey, mode);
}

// Stop. The platform's bare interrupt route is what the React hook expects;
// until the public edge serves it (it answers 404 today) a turn in
// `interrupt` mode cancels the running turn and queues this short one, which
// spends a model turn and lets the runtime finish a started tool call.
export async function interruptSession(sessionId: string, stopMessage: string): Promise<{ turnId?: string }> {
  try {
    await oc.interrupt(sessionId);
    return {};
  } catch (error) {
    if (!(error instanceof OcError && error.status === 404)) throw error;
  }
  const turn = await oc.turn(sessionId, stopMessage, crypto.randomUUID(), "interrupt");
  return { turnId: turn.turnId };
}

export function activeTurn(session: OcSession | null) {
  return session?.turns.find((turn) => turn.status === "running" || turn.status === "queued") ?? null;
}
