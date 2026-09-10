// What the app reads out of a session's durable events beyond the messages
// (which @opencomputer/react reduces): tool activity per turn for the
// conversation view, the outcome of a worker turn for the return path, and
// the shape of the app's own messages. Pure; shared by server and browser.
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

export const OUTCOME_PREFIX = "[topic outcome]";
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

/** The final assistant text of one turn, for the return path. */
export function turnResult(
  events: readonly OcEvent[],
  turnId: string,
): { status: "completed" | "failed" | "cancelled" | "running"; text: string; detail?: string } {
  let text = "";
  let status: "completed" | "failed" | "cancelled" | "running" = "running";
  let detail: string | undefined;
  for (const event of events) {
    if (event.turnId !== turnId) continue;
    if (event.type === "message.completed" && typeof event.data.text === "string") text = event.data.text;
    if (event.type === "turn.completed") status = "completed";
    if (event.type === "turn.failed") {
      status = "failed";
      detail = bounded(event.data.message ?? event.data.reason ?? "", 400);
    }
    if (event.type === "turn.cancelled") {
      status = "cancelled";
      detail = bounded(event.data.reason ?? "", 200);
    }
  }
  return { status, text, detail };
}

export interface OutcomeCard {
  readonly topicId: string;
  readonly title: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly detail?: string;
  readonly body: string;
}

/** The app's own outcome message (see return-path), as the conversation shows it. */
export function parseOutcome(text: string): OutcomeCard | null {
  if (!text.startsWith(OUTCOME_PREFIX)) return null;
  const rest = text.slice(OUTCOME_PREFIX.length).trimStart();
  const end = rest.indexOf("\n");
  const header = end === -1 ? rest : rest.slice(0, end);
  try {
    const parsed = JSON.parse(header) as { topicId?: string; title?: string; status?: string; detail?: string };
    const status = parsed.status === "failed" || parsed.status === "cancelled" ? parsed.status : "completed";
    return {
      topicId: parsed.topicId ?? "",
      title: parsed.title ?? parsed.topicId ?? "Topic",
      status,
      ...(parsed.detail ? { detail: parsed.detail } : {}),
      body: end === -1 ? "" : rest.slice(end + 1).trim(),
    };
  } catch {
    return { topicId: "", title: "Topic", status: "completed", body: rest };
  }
}
