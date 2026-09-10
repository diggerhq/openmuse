// One topic: its own conversation with the worker, the notes beside it.
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ConversationView } from "@/components/app/conversation/conversation-view";
import { useConversation } from "@/components/app/conversation/use-conversation";
import { ConversationFrame } from "@/components/app/conversation-frame";
import { useOwner } from "@/components/app/owner-context";
import { NotesEditor } from "@/components/app/panels/notes-editor";
import { WorkPanel } from "@/components/app/panels/work-panel";
import { StatusBadge, topicTone } from "@/components/app/topic-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/client/api";
import { useInvalidate, useTopic, useTopicAction } from "@/lib/client/queries";
import type { TopicDetail } from "@/lib/topics/service";

export function TopicConversation({ id }: { id: string }) {
  const { csrf } = useOwner();
  const query = useTopic(csrf, id);
  if (query.isPending) {
    return (
      <ConversationFrame
        title={<Skeleton className="h-4 w-40" />}
        panelTitle="Notes and work"
        panel={
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6" aria-busy="true">
          <Skeleton className="ml-auto h-10 w-2/5 rounded-xl" />
          <Skeleton className="h-24 w-4/5 rounded-xl" />
        </div>
      </ConversationFrame>
    );
  }
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ConversationFrame title={missing ? "Topic not found" : "Topic"} panelTitle="Notes and work" panel={null}>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {missing ? "There is no topic with this address." : `Could not load this topic: ${query.error.message}`}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {missing ? null : (
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
                Retry
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild>
              <Link to="/">Main conversation</Link>
            </Button>
          </div>
        </div>
      </ConversationFrame>
    );
  }
  return <TopicBody key={query.data.session?.id ?? "none"} detail={query.data} />;
}

function TopicBody({ detail }: { detail: TopicDetail }) {
  const { csrf } = useOwner();
  const invalidate = useInvalidate();
  const action = useTopicAction(csrf, detail.topic.id);
  const session = detail.session;
  const usable = session !== null && session.status !== "ended" && session.microvmState !== "terminated";
  const conversation = useConversation({
    csrf,
    sessionId: session?.id,
    onTurnSettled: () => void invalidate.topic(detail.topic.id),
    onMemorySaved: () => void invalidate.topic(detail.topic.id),
  });
  const tone = conversation.agent.isRunning ? "running" : topicTone(detail.topic);

  const disabledReason = detail.topic.archived
    ? "This topic is archived. Unarchive it in the notes panel to continue."
    : undefined;

  // No usable computer: the app admits the task and starts one from the notes.
  async function startFresh(text: string) {
    try {
      await action.mutateAsync({ path: "turns", body: { text } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send");
      throw error;
    }
  }

  return (
    <ConversationFrame
      title={detail.topic.title}
      status={<StatusBadge tone={tone} className="hidden sm:inline-flex" />}
      panelTitle="Notes and work"
      panel={
        <div>
          <NotesEditor detail={detail} now={conversation.now} />
          <WorkPanel detail={detail} conversation={conversation} />
        </div>
      }
    >
      <ConversationView
        conversation={conversation}
        who="Worker"
        placeholder={usable ? "Continue this topic…" : "Start a task on this topic…"}
        empty={
          session
            ? "No messages yet."
            : "No work yet on this topic. Ask for something below, or through the main conversation."
        }
        disabledReason={disabledReason}
        sendFallback={session && usable ? undefined : startFresh}
        header={
          session && !usable && !detail.topic.archived ? (
            <p className="rounded-md bg-status-attention-bg p-3 text-sm text-status-attention" role="status">
              This topic's computer has ended. The history stays readable; your next message starts a new one from the
              current notes.
            </p>
          ) : undefined
        }
      />
    </ConversationFrame>
  );
}
