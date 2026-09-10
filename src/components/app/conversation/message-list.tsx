// The conversation, newest at the bottom: sticks to the end while the reply
// streams unless the owner scrolled up, and shows long histories a page at
// a time instead of rendering every node.
import type { AgentMessage } from "@opencomputer/react";
import { useEffect, useRef, useState } from "react";
import { AssistantMessage, IncomingMessage, OwnerMessage } from "@/components/app/conversation/message";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/lib/events/messages";

const PAGE = 40;

export function MessageList({
  messages,
  activity,
  pending,
  who,
  now,
  empty,
  header,
}: {
  messages: AgentMessage[];
  activity: Activity;
  pending?: string;
  who: string;
  now: number;
  empty: string;
  header?: React.ReactNode;
}) {
  const [limit, setLimit] = useState(PAGE);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  // Follow new content only while the owner is at the bottom. Programmatic
  // scrolls land at distance 0, so they keep `stuck` true; a hand scroll up
  // releases it. Content growing later (streaming text, code highlighting,
  // images) re-sticks through the resize observer.
  useEffect(() => {
    const element = scroller.current;
    const inner = content.current;
    if (!element || !inner) return;
    const onScroll = () => {
      stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    const follow = () => {
      if (stuck.current) element.scrollTop = element.scrollHeight;
    };
    follow();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(follow);
    observer?.observe(inner);
    return () => {
      element.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  const shown = messages.slice(Math.max(0, messages.length - limit));
  const hidden = messages.length - shown.length;
  // Turns that started and have no reply message yet still show their activity.
  const runningTurns = Object.values(activity.turns).filter(
    (turn) =>
      turn.status === "running" &&
      !messages.some((message) => message.role === "assistant" && message.turnId === turn.turnId),
  );

  return (
    <div ref={scroller} className="h-full min-h-0 overflow-y-auto overscroll-contain" aria-live="polite">
      <div ref={content} className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        {header}
        {hidden > 0 ? (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                stuck.current = false;
                setLimit((value) => value + PAGE);
              }}
            >
              Show earlier messages ({hidden} more)
            </Button>
          </div>
        ) : null}
        {messages.length === 0 && !pending && runningTurns.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{empty}</p>
        ) : null}
        {shown.map((message) =>
          message.role === "assistant" ? (
            <AssistantMessage
              key={message.id}
              text={message.text}
              streaming={Boolean(message.streaming)}
              tools={message.turnId ? (activity.tools[message.turnId] ?? []) : []}
              turn={message.turnId ? activity.turns[message.turnId] : undefined}
              now={now}
              who={who}
            />
          ) : (
            <IncomingMessage key={message.id} message={message} />
          ),
        )}
        {runningTurns.map((turn) => (
          <AssistantMessage
            key={turn.turnId}
            text=""
            streaming={false}
            tools={activity.tools[turn.turnId] ?? []}
            turn={turn}
            now={now}
            who={who}
          />
        ))}
        {pending ? <OwnerMessage text={pending} pending /> : null}
      </div>
    </div>
  );
}
