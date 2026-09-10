// OpenComputer management API, held server-side with the API key. Only the
// routes the public api-edge exposes today are used.
import { env } from "@/lib/env";

export interface OcEvent {
  readonly id?: string;
  readonly seq: number;
  readonly timestamp?: string;
  readonly turnId?: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export interface OcTurn {
  readonly id: string;
  readonly input: string;
  readonly mode: "queue" | "steer" | "interrupt";
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OcSession {
  readonly id: string;
  readonly agentId: string;
  readonly deploymentId: string;
  readonly executionMode?: "microvm" | "workerd";
  readonly status: string;
  readonly microvmState?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turns: readonly OcTurn[];
}

export class OcError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  return (await requestWithStatus<T>(path, init)).body;
}

async function requestWithStatus<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<{ status: number; body: T }> {
  const { idempotencyKey, ...rest } = init;
  const response = await fetch(`${env().apiUrl}/api/managed-agents${path}`, {
    ...rest,
    headers: {
      "x-api-key": env().apiKey,
      accept: "application/json",
      ...(rest.body ? { "content-type": "application/json" } : {}),
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      ...(rest.headers ?? {}),
    },
    // Never follow a redirect with the key attached; "manual" is what every runtime supports.
    redirect: "manual",
    signal: rest.signal ?? AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new OcError(response.status, "redirect", `OpenComputer ${path} redirected`);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } | string } | null)?.error;
    const code =
      typeof error === "object" && error?.code
        ? error.code
        : typeof error === "string"
          ? error
          : `http_${response.status}`;
    const message =
      typeof error === "object" && error?.message ? error.message : `OpenComputer ${path} failed (${response.status})`;
    throw new OcError(response.status, code, message);
  }
  return { status: response.status, body: body as T };
}

export const oc = {
  async createSession(agent: string, idempotencyKey: string) {
    const result = await requestWithStatus<{
      session: { id: string; executionMode?: "microvm" | "workerd"; status: string };
      deployment?: { id: string };
    }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ agentId: `${agent}@${env().environment}`, source: "api" }),
      idempotencyKey,
    });
    return { ...result.body, created: result.status === 201 };
  },
  session(id: string) {
    return request<OcSession>(`/sessions/${encodeURIComponent(id)}`);
  },
  async sessions() {
    return (await request<{ sessions: OcSession[] }>("/sessions")).sessions;
  },
  async events(id: string, after: number, signal?: AbortSignal) {
    return (
      await request<{ events: OcEvent[] }>(`/sessions/${encodeURIComponent(id)}/events?after=${after}`, { signal })
    ).events;
  },
  turn(id: string, input: string, idempotencyKey: string, mode: "queue" | "steer" | "interrupt" = "queue") {
    return request<{ turnId: string; status: string; duplicate: boolean }>(
      `/sessions/${encodeURIComponent(id)}/turns`,
      { method: "POST", body: JSON.stringify({ input, idempotencyKey, mode }) },
    );
  },
  interrupt(id: string) {
    return request<unknown>(`/sessions/${encodeURIComponent(id)}/interrupt`, { method: "POST" });
  },
  resume(id: string) {
    return request<unknown>(`/sessions/${encodeURIComponent(id)}/resume`, { method: "POST" });
  },
  suspend(id: string) {
    return request<unknown>(`/sessions/${encodeURIComponent(id)}/suspend`, { method: "POST" });
  },
  end(id: string) {
    return request<unknown>(`/sessions/${encodeURIComponent(id)}/end`, { method: "POST" });
  },
  project() {
    return request<{
      project: { id: string; environments: Array<{ name: string; agentId: string; activeDeploymentId?: string }> };
    }>(`/projects/${encodeURIComponent(env().projectId)}`);
  },
  // A project secret the managed connections attach; the same route the CLI's
  // `secrets set --allow-origin` uses. Replaces the value and the origins.
  putSecret(name: string, value: string, allowedOrigins: readonly string[]) {
    return request<unknown>(`/projects/${encodeURIComponent(env().projectId)}/secrets/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({ value, environment: env().environment, allowedOrigins }),
    });
  },
};

// All events of a session from `after`, following seq pages until drained.
export async function allEvents(id: string, after = 0): Promise<OcEvent[]> {
  const collected: OcEvent[] = [];
  let cursor = after;
  for (;;) {
    const events = await oc.events(id, cursor);
    if (events.length === 0) return collected;
    collected.push(...events);
    const next = Math.max(cursor, ...events.map((event) => event.seq));
    if (next === cursor) return collected;
    cursor = next;
  }
}
