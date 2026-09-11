// The worker's tool activity inside an assistant message: compact rows
// (what ran, how long, an excerpt of the result) that expand on demand.
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon, Loader2Icon, TerminalIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { commandExcerpt, duration } from "@/lib/client/format";
import type { ToolCall } from "@/lib/events/messages";

function ToolRow({ call, now }: { call: ToolCall; now: number }) {
  const [open, setOpen] = useState(false);
  const Icon = call.status === "running" ? Loader2Icon : call.status === "failed" ? XIcon : CheckIcon;
  const excerpt = commandExcerpt(call.input);
  return (
    <li className="text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            call.status === "running" && "animate-spin text-status-running motion-reduce:animate-none",
            call.status === "failed" && "text-status-failed",
            call.status === "completed" && "text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="shrink-0 font-medium">{call.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{excerpt}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {duration(call.startedAt, call.endedAt, now)}
        </span>
        <span className="sr-only">
          {call.status === "running" ? "running" : call.status === "failed" ? "failed" : "done"}
        </span>
      </button>
      {open ? (
        <div className="mt-1 mb-2 ml-6 space-y-2">
          {call.input ? (
            <pre className="max-h-48 overflow-auto rounded-md border bg-panel-2 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
              {call.input}
            </pre>
          ) : null}
          {call.output ? (
            <pre className="max-h-64 overflow-auto rounded-md border bg-code p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-code-foreground [overflow-wrap:anywhere]">
              {call.output}
            </pre>
          ) : call.status === "running" ? (
            <p className="text-muted-foreground">Still running…</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ToolActivity({ calls, running, now }: { calls: readonly ToolCall[]; running: boolean; now: number }) {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  if (calls.length === 0) return null;
  const expanded = open ?? running;
  const first = calls[0];
  const last = calls[calls.length - 1];
  const total = duration(first?.startedAt, running ? undefined : last?.endedAt, now);
  const failed = calls.filter((call) => call.status === "failed").length;
  return (
    <div className="mb-2 rounded-md border bg-panel/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
      >
        <ChevronRightIcon className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} aria-hidden />
        <TerminalIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">
          {running ? "Working" : "Did"} {calls.length} {calls.length === 1 ? "step" : "steps"}
        </span>
        {failed ? <span className="text-status-failed">{failed} failed</span> : null}
        <span className="ml-auto tabular-nums">{total}</span>
      </button>
      {expanded ? (
        <ul className="border-t px-1 py-1">
          {calls.map((call) => (
            <ToolRow key={call.id} call={call} now={now} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
