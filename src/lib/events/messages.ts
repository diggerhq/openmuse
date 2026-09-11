// What the browser reads out of a session's durable events beyond the
// messages (which @opencomputer/react reduces): tool activity per turn for
// the conversation view, and the delivered worker outcomes and Stop notes
// among the incoming messages. Pure.
import type { OcEvent } from "@/lib/oc/client";

export interface ToolCall {
  readonly id: string;
  readonly callId?: string;
  readonly turnId?: string;
  readonly name: string;
  readonly input?: string;
  readonly output?: string;
  readonly status: "running" | "completed" | "failed";
  readonly startedAt?: string;
  readonly endedAt?: string;
}

export interface TurnState {
  readonly turnId: string;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** The reason a turn failed or was cancelled, when the event carries one. */
  readonly detail?: string;
}

export interface Activity {
  /** Tool calls in log order, keyed by turn. */
  readonly tools: Readonly<Record<string, readonly ToolCall[]>>;
  readonly turns: Readonly<Record<string, TurnState>>;
  /** The last runtime problem the log recorded (a lost sandbox, a failed session). */
  readonly runtime?: { readonly message: string; readonly at?: string };
  readonly cursor: number;
}

export const STOP_PREFIX = "[stop]";

export function bounded(value: unknown, max = 2000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// The two runtimes shape tool events differently: the microVM harness sends
// { tool, input, output }, the Durable Object runtime { id, input, content }
// with the tool name arriving on tool.progress metadata.
function toolName(data: Record<string, unknown>): string | undefined {
  if (typeof data.tool === "string") return data.tool;
  const metadata = data.metadata as Record<string, unknown> | undefined;
  return typeof metadata?.tool === "string" ? metadata.tool : undefined;
}

function toolOutput(data: Record<string, unknown>): unknown {
  if (data.output !== undefined) return data.output;
  if (Array.isArray(data.content)) {
    return data.content
      .map((part) =>
        typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : JSON.stringify(part),
      )
      .join("\n");
  }
  return data.error ?? data.message ?? "";
}

function callId(data: Record<string, unknown>): string | undefined {
  return typeof data.callId === "string" ? data.callId : typeof data.id === "string" ? data.id : undefined;
}

export function emptyActivity(): Activity {
  return { tools: {}, turns: {}, cursor: 0 };
}

function withTool(
  activity: Activity,
  turnId: string,
  update: (calls: readonly ToolCall[]) => readonly ToolCall[],
): Activity {
  return { ...activity, tools: { ...activity.tools, [turnId]: update(activity.tools[turnId] ?? []) } };
}

function finishTool(
  calls: readonly ToolCall[],
  id: string | undefined,
  name: string | undefined,
  patch: Partial<ToolCall>,
): readonly ToolCall[] {
  const index = id
    ? calls.findLastIndex((call) => call.callId === id && call.status === "running")
    : calls.findLastIndex((call) => call.status === "running");
  if (index < 0)
    return [
      ...calls,
      { id: `late-${id ?? calls.length}`, callId: id, name: name ?? "tool", status: "completed", ...patch },
    ];
  const current = calls[index];
  if (!current) return calls;
  const next = [...calls];
  next[index] = { ...current, ...(name && current.name === "tool" ? { name } : {}), ...patch };
  return next;
}

export function applyActivity(activity: Activity, event: OcEvent): Activity {
  if (event.seq <= activity.cursor) return activity;
  const base: Activity = { ...activity, cursor: event.seq };
  const data = event.data ?? {};
  const at = event.timestamp;
  const turnId = event.turnId ?? "";
  switch (event.type) {
    case "turn.started":
      return { ...base, turns: { ...base.turns, [turnId]: { turnId, status: "running", startedAt: at } } };
    case "tool.started":
      return withTool(base, turnId, (calls) => [
        ...calls,
        {
          id: `tool-${event.seq}`,
          callId: callId(data),
          turnId: event.turnId,
          name: toolName(data) ?? "tool",
          input: bounded(data.input, 800),
          status: "running",
          startedAt: at,
        },
      ]);
    case "tool.progress": {
      // Names the started entry on the runtime that reports the tool late.
      const name = toolName(data);
      const id = callId(data);
      if (!name || !id) return base;
      return withTool(base, turnId, (calls) =>
        calls.map((call) => (call.callId === id && call.name === "tool" ? { ...call, name } : call)),
      );
    }
    case "tool.completed":
      return withTool(base, turnId, (calls) =>
        finishTool(calls, callId(data), toolName(data), {
          status: "completed",
          output: bounded(toolOutput(data), 1200),
          endedAt: at,
        }),
      );
    case "tool.failed":
      return withTool(base, turnId, (calls) =>
        finishTool(calls, callId(data), toolName(data), {
          status: "failed",
          output: bounded(data.error ?? data.message ?? toolOutput(data), 800),
          endedAt: at,
        }),
      );
    case "turn.completed":
    case "turn.failed":
    case "turn.cancelled": {
      const status =
        event.type === "turn.completed" ? "completed" : event.type === "turn.failed" ? "failed" : "cancelled";
      const detail = status === "completed" ? undefined : bounded(data.message ?? data.reason ?? "", 400) || undefined;
      const started = base.turns[turnId];
      return {
        ...base,
        turns: { ...base.turns, [turnId]: { ...started, turnId, status, endedAt: at, ...(detail ? { detail } : {}) } },
      };
    }
    case "runtime.disconnected":
    case "session.failed":
      return { ...base, runtime: { message: bounded(data.message ?? data.reason ?? event.type, 400), at } };
    default:
      return base;
  }
}

export interface OutcomeCard {
  readonly status: "completed" | "failed" | "cancelled";
  readonly agentId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly occurredAt: string;
  readonly reason?: string;
  /** The failure message, when the turn failed. */
  readonly detail?: string;
  /** The worker's final message, when the turn completed. */
  readonly body: string;
  readonly truncated: boolean;
}

// A turn an event subscription started records the delivered outcome as
// its input, in the platform's own text form: "Outcome event turn.<type>
// from agent <id> (session <id>, turn <id>) at <time>[ (<reason>)]." then
// "Result:" and the worker's message, or "Error:" and the failure. The
// agent reads the same outcome typed through useInput(); the browser only
// has this text, so it recognises it here and shows it as what it is.
const OUTCOME =
  /^Outcome event turn\.(completed|failed|cancelled) from agent (\S+) \(session ([A-Za-z0-9-]+), turn ([A-Za-z0-9-]+)\) at (\S+?)(?: \(([^)\n]*)\))?\.(?:\n([\s\S]*))?$/;

export function parseOutcome(text: string): OutcomeCard | null {
  const match = OUTCOME.exec(text);
  if (!match) return null;
  const [, status, agentId, sessionId, turnId, occurredAt, reason, rest = ""] = match as unknown as [
    string,
    OutcomeCard["status"],
    string,
    string,
    string,
    string,
    string | undefined,
    string | undefined,
  ];
  const result = /^Result( \(truncated\))?:\n?([\s\S]*)$/.exec(rest);
  const error = /^Error: ([\s\S]*)$/.exec(rest);
  return {
    status,
    agentId,
    sessionId,
    turnId,
    occurredAt,
    ...(reason ? { reason } : {}),
    ...(error ? { detail: error[1] } : {}),
    body: result ? (result[2] ?? "").trim() : "",
    truncated: Boolean(result?.[1]),
  };
}
