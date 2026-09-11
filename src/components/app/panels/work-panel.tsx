// What the topic's computer is doing right now, with Stop, elapsed time and
// the way to the platform's own view of the session.
import { ExternalLinkIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Conversation } from "@/components/app/conversation/use-conversation";
import { useOwner } from "@/components/app/owner-context";
import { StatusBadge, topicTone } from "@/components/app/topic-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { duration, relativeTime } from "@/lib/client/format";
import { useTopicAction } from "@/lib/client/queries";
import type { TopicDetail } from "@/lib/topics/service";

export function WorkPanel({ detail, conversation }: { detail: TopicDetail; conversation: Conversation }) {
  const { csrf, sessionLinkBase } = useOwner();
  const action = useTopicAction(csrf, detail.topic.id);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const { agent, currentTurn, activity, now } = conversation;
  const session = detail.session;
  const usable = session !== null && session.status !== "ended" && session.microvmState !== "terminated";
  const running = agent.isRunning;
  const tone = running ? "running" : topicTone(detail.topic);
  const steps = currentTurn ? (activity.tools[currentTurn.turnId] ?? []).length : 0;
  const lastTurn = Object.values(activity.turns).at(-1);
  const [stopping, setStopping] = useState(false);

  async function stop() {
    setStopping(true);
    try {
      await agent.stop();
      toast.message("Stopping. The computer may finish the command it is running.");
    } finally {
      setStopping(false);
    }
  }

  async function replace() {
    try {
      await action.mutateAsync({ path: "replace-worker" });
      toast.success("The next task starts a fresh computer from the current notes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not replace the computer");
    }
  }

  return (
    <section className="space-y-3 p-4" aria-labelledby="work-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="work-heading" className="text-sm font-semibold">
          Work
        </h2>
        <StatusBadge tone={tone} label={running ? "Working" : undefined} />
      </div>
      {!session ? (
        <p className="text-xs text-muted-foreground">No computer yet. It starts with the first task.</p>
      ) : running ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Elapsed</dt>
          <dd className="tabular-nums">{duration(currentTurn?.startedAt, undefined, now) || "starting"}</dd>
          <dt className="text-muted-foreground">Steps</dt>
          <dd>{steps}</dd>
        </dl>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Last reply</dt>
          <dd>
            {lastTurn
              ? `${lastTurn.status === "completed" ? "Finished" : lastTurn.status === "failed" ? "Failed" : "Stopped"} ${relativeTime(lastTurn.endedAt, now)}`
              : "None yet"}
          </dd>
          {lastTurn?.detail ? (
            <>
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="text-status-failed">{lastTurn.detail}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Computer</dt>
          <dd>{usable ? (session.microvmState === "suspended" ? "Paused until the next task" : "Ready") : "Ended"}</dd>
          <dt className="text-muted-foreground">Tasks so far</dt>
          <dd>{detail.topic.work?.turns ?? 0}</dd>
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button size="sm" variant="outline" onClick={() => void stop()} disabled={stopping}>
            <SquareIcon className="size-3.5 fill-current" aria-hidden /> {stopping ? "Stopping…" : "Stop"}
          </Button>
        ) : null}
        {session ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={`${sessionLinkBase}/${encodeURIComponent(session.id)}`} target="_blank" rel="noreferrer noopener">
              Open in OpenComputer <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        ) : null}
        {session && usable && !detail.topic.archived && !running ? (
          <Button size="sm" variant="ghost" onClick={() => setConfirmReplace(true)} disabled={action.isPending}>
            <RefreshCwIcon aria-hidden /> New computer
          </Button>
        ) : null}
      </div>
      {detail.previousWorkerSessionIds.length ? (
        <p className="text-[11px] text-muted-foreground">
          {detail.previousWorkerSessionIds.length} earlier{" "}
          {detail.previousWorkerSessionIds.length === 1 ? "computer" : "computers"} on this topic.
        </p>
      ) : null}
      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new computer for this topic?</AlertDialogTitle>
            <AlertDialogDescription>
              The current one is ended. The next task starts fresh from the current notes; this conversation's history
              stays readable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void replace()}>Start new</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
