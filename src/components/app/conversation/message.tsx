// One entry of a conversation: the owner's message, the assistant's reply
// with its tool activity, an outcome card from a topic, or a note that the
// owner pressed Stop.

import type { AgentMessage } from "@opencomputer/react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRightIcon, CircleAlertIcon, CircleCheckIcon, CircleSlashIcon } from "lucide-react";
import { Markdown } from "@/components/app/conversation/markdown";
import { ToolActivity } from "@/components/app/conversation/tool-activity";
import { clock } from "@/lib/client/format";
import {
  type OutcomeCard as Outcome,
  parseOutcome,
  STOP_PREFIX,
  type ToolCall,
  type TurnState,
} from "@/lib/events/messages";

export function OwnerMessage({ text, pending, at }: { text: string; pending?: boolean; at?: string }) {
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] rounded-xl rounded-br-sm bg-owner px-3.5 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
          pending && "opacity-70",
        )}
      >
        <span className="sr-only">You: </span>
        {text}
        {pending ? <span className="ml-2 text-xs text-muted-foreground">Sending…</span> : null}
        {at ? <span className="sr-only"> at {clock(at)}</span> : null}
      </div>
    </div>
  );
}

export function StopNote() {
  return <p className="text-center text-xs text-muted-foreground">You pressed Stop</p>;
}

export function AssistantMessage({
  text,
  streaming,
  tools,
  turn,
  now,
  who,
}: {
  text: string;
  streaming: boolean;
  tools: readonly ToolCall[];
  turn?: TurnState;
  now: number;
  who: string;
}) {
  const running = turn?.status === "running";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{who}</span>
      <div className="min-w-0">
        <ToolActivity calls={tools} running={running} now={now} />
        {text ? (
          <Markdown text={text} live={streaming} className={cn(streaming && "streaming-caret")} />
        ) : running ? (
          <p className="text-sm text-muted-foreground" role="status">
            {tools.length ? "Working…" : "Thinking…"}
          </p>
        ) : null}
        {turn?.status === "failed" ? (
          <p
            className="mt-2 flex items-start gap-1.5 rounded-md bg-status-failed-bg px-2.5 py-1.5 text-xs text-status-failed"
            role="alert"
          >
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>This reply failed{turn.detail ? `: ${turn.detail}` : "."}</span>
          </p>
        ) : null}
        {turn?.status === "cancelled" ? (
          <p className="mt-2 text-xs text-muted-foreground">Stopped{turn.detail ? ` (${turn.detail})` : ""}.</p>
        ) : null}
      </div>
    </div>
  );
}

const OUTCOME_ICON = { completed: CircleCheckIcon, failed: CircleAlertIcon, cancelled: CircleSlashIcon } as const;
const OUTCOME_TONE = {
  completed: "text-status-running",
  failed: "text-status-failed",
  cancelled: "text-muted-foreground",
} as const;
const OUTCOME_LABEL = {
  completed: "finished a task",
  failed: "could not finish a task",
  cancelled: "was stopped",
} as const;

export function OutcomeCard({ outcome }: { outcome: Outcome }) {
  const Icon = OUTCOME_ICON[outcome.status];
  const body = outcome.body.length > 600 ? `${outcome.body.slice(0, 600)}…` : outcome.body;
  return (
    <div className="rounded-lg border bg-panel p-3">
      <div className="flex items-center gap-2 text-xs">
        <Icon className={cn("size-4", OUTCOME_TONE[outcome.status])} aria-hidden />
        <span className="font-medium">{outcome.title}</span>
        <span className="text-muted-foreground">{OUTCOME_LABEL[outcome.status]}</span>
        {outcome.topicId ? (
          <Link
            to="/topics/$id"
            params={{ id: outcome.topicId }}
            className="ml-auto inline-flex items-center gap-1 text-brand hover:underline"
          >
            Open topic <ArrowRightIcon className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      {outcome.detail ? <p className="mt-1 text-xs text-status-failed">{outcome.detail}</p> : null}
      {body ? <Markdown text={body} className="mt-2 text-muted-foreground" /> : null}
    </div>
  );
}

/** Renders an incoming (owner-role) log message as what it is. */
export function IncomingMessage({ message }: { message: AgentMessage }) {
  const outcome = parseOutcome(message.text);
  if (outcome) return <OutcomeCard outcome={outcome} />;
  if (message.text.startsWith(STOP_PREFIX)) return <StopNote />;
  return <OwnerMessage text={message.text} />;
}
