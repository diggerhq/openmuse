// The centre of the screen: the messages, a reconnect banner when polling
// drops, and the composer. Sending goes through the attached session, or
// through a fallback when the topic has no usable session yet.
import { WifiOffIcon } from "lucide-react";
import { type ReactNode, type Ref, useState } from "react";
import { Composer, type ComposerHandle } from "@/components/app/conversation/composer";
import { MessageList } from "@/components/app/conversation/message-list";
import type { Conversation } from "@/components/app/conversation/use-conversation";
import { Skeleton } from "@/components/ui/skeleton";

export function ConversationView({
  conversation,
  who,
  placeholder,
  empty,
  disabledReason,
  sendFallback,
  header,
  composerRef,
}: {
  conversation: Conversation;
  who: string;
  placeholder: string;
  empty: string;
  disabledReason?: string;
  /** Used when there is no attached session to send through. */
  sendFallback?: (text: string) => Promise<void>;
  header?: ReactNode;
  composerRef?: Ref<ComposerHandle>;
}) {
  const { agent, activity, online, now } = conversation;
  const [pending, setPending] = useState<string>();

  async function send(text: string) {
    setPending(text);
    try {
      if (sendFallback) await sendFallback(text);
      else await agent.send(text);
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!online ? (
        <div
          className="flex items-center gap-2 border-b bg-status-attention-bg px-4 py-1.5 text-xs text-status-attention"
          role="status"
        >
          <WifiOffIcon className="size-3.5" aria-hidden />
          Connection lost. Trying again…
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {agent.isReplaying && agent.messages.length === 0 ? (
          <output
            className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6"
            aria-busy="true"
            aria-label="Loading the conversation"
          >
            <Skeleton className="ml-auto h-10 w-2/5 rounded-xl" />
            <Skeleton className="h-24 w-4/5 rounded-xl" />
            <Skeleton className="ml-auto h-10 w-1/3 rounded-xl" />
            <Skeleton className="h-16 w-3/5 rounded-xl" />
          </output>
        ) : (
          <MessageList
            messages={agent.messages}
            activity={activity}
            pending={pending}
            who={who}
            now={now}
            empty={empty}
            header={header}
          />
        )}
      </div>
      <Composer
        ref={composerRef}
        onSend={send}
        onStop={agent.stop}
        running={agent.isRunning}
        disabledReason={disabledReason}
        placeholder={placeholder}
      />
    </div>
  );
}
