// One vocabulary for a topic's state, derived from the platform's turn and
// session records, with a colour and a non-colour cue everywhere it appears.
import { cn } from "cn";
import type { TopicSummary } from "@/lib/topics/service";

export type TopicTone = "running" | "attention" | "idle" | "failed" | "archived";

export function topicTone(topic: Pick<TopicSummary, "archived" | "work">): TopicTone {
  if (topic.archived) return "archived";
  const work = topic.work;
  if (!work) return "idle";
  if (work.activeTurnId) return "running";
  if (work.lastTurnStatus === "failed" || work.status === "failed") return "failed";
  if (work.lastTurnStatus === "cancelled" || work.status === "ended") return "attention";
  return "idle";
}

export const TONE_LABEL: Record<TopicTone, string> = {
  running: "Working",
  attention: "Needs you",
  idle: "Idle",
  failed: "Failed",
  archived: "Archived",
};

const DOT: Record<TopicTone, string> = {
  running: "bg-status-running",
  attention: "bg-status-attention",
  idle: "bg-status-idle/60",
  failed: "bg-status-failed",
  archived: "bg-transparent border border-status-idle/60",
};

const BADGE: Record<TopicTone, string> = {
  running: "bg-status-running-bg text-status-running",
  attention: "bg-status-attention-bg text-status-attention",
  idle: "bg-status-idle-bg text-status-idle",
  failed: "bg-status-failed-bg text-status-failed",
  archived: "bg-status-idle-bg text-status-idle",
};

export function StatusDot({ tone, className }: { tone: TopicTone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT[tone],
        tone === "running" && "animate-pulse motion-reduce:animate-none",
        className,
      )}
      aria-hidden
    />
  );
}

export function StatusBadge({ tone, label, className }: { tone: TopicTone; label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        BADGE[tone],
        className,
      )}
    >
      <StatusDot tone={tone} />
      {label ?? TONE_LABEL[tone]}
    </span>
  );
}
