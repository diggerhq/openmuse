// Reduce a session's durable events into what the UI shows: messages (owner
// and assistant), activity lines (tools) and turn state. Shared by the server
// (history) and the browser (live stream). No platform calls here.
import type { OcEvent } from "@/lib/oc/client";
import { stripRecall } from "@/lib/memory/envelope";

export interface ChatMessage {
  readonly id: string;
  readonly turnId?: string;
  readonly role: "owner" | "assistant" | "app";
  readonly text: string;
  readonly at?: string;
  readonly streaming?: boolean;
}

export interface Activity {
  readonly id: string;
  readonly callId?: string;
  readonly turnId?: string;
  readonly at?: string;
  readonly kind: "tool.started" | "tool.completed" | "tool.failed" | "turn.started" | "turn.completed" | "turn.failed" | "turn.cancelled" | "runtime";
  readonly label: string;
  readonly detail?: string;
}

export interface Timeline {
  readonly messages: ChatMessage[];
  readonly activity: Activity[];
  readonly cursor: number;
  readonly running: boolean;
}

const OUTCOME_PREFIX = "[topic outcome]";

function bounded(value: unknown, max = 2000): string {
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
    return data.content.map((part) => (typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : JSON.stringify(part))).join("\n");
  }
  return data.error ?? data.message ?? "";
}

function callId(data: Record<string, unknown>): string | undefined {
  return typeof data.callId === "string" ? data.callId : typeof data.id === "string" ? data.id : undefined;
}

export function emptyTimeline(): Timeline {
  return { messages: [], activity: [], cursor: 0, running: false };
}

export function applyEvent(timeline: Timeline, event: OcEvent): Timeline {
  const messages = [...timeline.messages];
  const activity = [...timeline.activity];
  let running = timeline.running;
  const data = event.data ?? {};
  const at = event.timestamp;
  switch (event.type) {
    case "message.received": {
      const text = stripRecall(String(data.input ?? ""));
      messages.push({ id: `in-${event.seq}`, turnId: event.turnId, role: text.startsWith(OUTCOME_PREFIX) ? "app" : "owner", text, at });
      break;
    }
    case "turn.started":
      running = true;
      activity.push({ id: `a-${event.seq}`, turnId: event.turnId, at, kind: "turn.started", label: "turn started" });
      break;
    case "message.delta": {
      const last = messages[messages.length - 1];
      if (last && last.role === "assistant" && last.turnId === event.turnId && last.streaming) {
        messages[messages.length - 1] = { ...last, text: last.text + String(data.text ?? "") };
      } else {
        messages.push({ id: `out-${event.seq}`, turnId: event.turnId, role: "assistant", text: String(data.text ?? ""), at, streaming: true });
      }
      break;
    }
    case "message.completed": {
      const text = String(data.text ?? "");
      const index = messages.findLastIndex((m) => m.role === "assistant" && m.turnId === event.turnId && m.streaming);
      if (index >= 0) messages[index] = { ...messages[index], text, streaming: false };
      else if (text) messages.push({ id: `out-${event.seq}`, turnId: event.turnId, role: "assistant", text, at });
      break;
    }
    case "tool.started":
      activity.push({ id: `a-${event.seq}`, callId: callId(data), turnId: event.turnId, at, kind: "tool.started", label: toolName(data) ?? "tool", detail: bounded(data.input, 800) });
      break;
    case "tool.progress": {
      // Names the started entry on the runtime that reports the tool late.
      const name = toolName(data);
      const id = callId(data);
      if (name && id) {
        for (let index = activity.length - 1; index >= 0; index -= 1) {
          if (activity[index].callId === id && activity[index].label === "tool") { activity[index] = { ...activity[index], label: name }; break; }
        }
      }
      break;
    }
    case "tool.completed": {
      const id = callId(data);
      const started = id ? activity.find((item) => item.callId === id && item.kind === "tool.started") : undefined;
      activity.push({ id: `a-${event.seq}`, callId: id, turnId: event.turnId, at, kind: "tool.completed", label: toolName(data) ?? started?.label ?? "tool", detail: bounded(toolOutput(data), 1200) });
      break;
    }
    case "tool.failed": {
      const id = callId(data);
      const started = id ? activity.find((item) => item.callId === id && item.kind === "tool.started") : undefined;
      activity.push({ id: `a-${event.seq}`, callId: id, turnId: event.turnId, at, kind: "tool.failed", label: toolName(data) ?? started?.label ?? "tool", detail: bounded(data.error ?? data.message ?? toolOutput(data), 800) });
      break;
    }
    case "turn.completed":
    case "turn.failed":
    case "turn.cancelled": {
      running = false;
      const index = messages.findLastIndex((m) => m.role === "assistant" && m.turnId === event.turnId && m.streaming);
      if (index >= 0) messages[index] = { ...messages[index], streaming: false };
      const detail = event.type === "turn.completed" ? undefined : bounded(data.message ?? data.reason ?? "", 400) || undefined;
      activity.push({ id: `a-${event.seq}`, turnId: event.turnId, at, kind: event.type, label: event.type.replace("turn.", "turn "), detail });
      break;
    }
    case "runtime.disconnected":
    case "session.failed":
      running = false;
      activity.push({ id: `a-${event.seq}`, turnId: event.turnId, at, kind: "runtime", label: event.type, detail: bounded(data.message ?? data.reason ?? "", 400) || undefined });
      break;
    default:
      break;
  }
  return { messages, activity, cursor: Math.max(timeline.cursor, event.seq), running };
}

export function reduceEvents(events: readonly OcEvent[], initial: Timeline = emptyTimeline()): Timeline {
  return events.reduce(applyEvent, initial);
}

/** The final assistant text of one turn, for the return path. */
export function turnResult(events: readonly OcEvent[], turnId: string): { status: "completed" | "failed" | "cancelled" | "running"; text: string; detail?: string } {
  let text = "";
  let status: "completed" | "failed" | "cancelled" | "running" = "running";
  let detail: string | undefined;
  for (const event of events) {
    if (event.turnId !== turnId) continue;
    if (event.type === "message.completed" && typeof event.data.text === "string") text = event.data.text;
    if (event.type === "turn.completed") status = "completed";
    if (event.type === "turn.failed") { status = "failed"; detail = bounded(event.data.message ?? event.data.reason ?? "", 400); }
    if (event.type === "turn.cancelled") { status = "cancelled"; detail = bounded(event.data.reason ?? "", 200); }
  }
  return { status, text, detail };
}
