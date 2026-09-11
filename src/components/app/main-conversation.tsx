// The coordinator's conversation with the owner.
import { useEffect, useRef } from "react";
import { START_TOPIC_EVENT } from "@/components/app/command-palette";
import type { ComposerHandle } from "@/components/app/conversation/composer";
import { ConversationView } from "@/components/app/conversation/conversation-view";
import { useConversation, useNow } from "@/components/app/conversation/use-conversation";
import { ConversationFrame } from "@/components/app/conversation-frame";
import { useOwner } from "@/components/app/owner-context";
import { MainPanel } from "@/components/app/panels/main-panel";
import { Button } from "@/components/ui/button";
import { useConversation as useConversationQuery, useInvalidate } from "@/lib/client/queries";

export function MainConversation() {
  const { csrf } = useOwner();
  const query = useConversationQuery(csrf);
  return (
    <MainBody
      key={query.data?.sessionId ?? "none"}
      sessionId={query.data?.sessionId}
      error={query.error}
      retry={() => void query.refetch()}
      loading={query.isPending}
    />
  );
}

function MainBody({
  sessionId,
  error,
  retry,
  loading,
}: {
  sessionId: string | undefined;
  error: Error | null;
  retry: () => void;
  loading: boolean;
}) {
  const { csrf } = useOwner();
  const invalidate = useInvalidate();
  const conversation = useConversation({
    csrf,
    sessionId,
    onTurnSettled: () => {
      void invalidate.topics();
      void invalidate.profile();
    },
    onMemorySaved: () => void invalidate.profile(),
  });
  const composer = useRef<ComposerHandle>(null);
  const now = useNow(false);

  useEffect(() => {
    const onStart = () => composer.current?.insert("Start a new topic: ");
    window.addEventListener(START_TOPIC_EVENT, onStart);
    return () => window.removeEventListener(START_TOPIC_EVENT, onStart);
  }, []);

  const disabledReason = error
    ? "The assistant is not reachable right now."
    : loading
      ? "Connecting to the assistant…"
      : undefined;

  return (
    <ConversationFrame
      title="Main conversation"
      panelTitle="About you and running work"
      panel={<MainPanel now={now} />}
      actions={
        error ? (
          <Button size="sm" variant="outline" onClick={retry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      <ConversationView
        conversation={conversation}
        who="OpenMuse"
        placeholder="Ask, or hand over work…"
        empty="Ask anything. Work that needs a computer becomes a topic in the sidebar."
        disabledReason={disabledReason}
        composerRef={composer}
        header={
          error ? (
            <p className="rounded-md bg-status-failed-bg p-3 text-sm text-status-failed" role="alert">
              Could not reach the assistant: {error.message}
            </p>
          ) : undefined
        }
      />
    </ConversationFrame>
  );
}
