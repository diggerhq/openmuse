// Cmd+K: jump between conversations, or ask the assistant to start a topic.
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useOwner } from "@/components/app/owner-context";
import { StatusDot, TONE_LABEL, topicTone } from "@/components/app/topic-status";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTopics } from "@/lib/client/queries";

export const START_TOPIC_EVENT = "openmuse:start-topic";

export function CommandPalette() {
  const { csrf } = useOwner();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const topics = useTopics(csrf);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (id?: string) => {
    setOpen(false);
    void (id ? navigate({ to: "/topics/$id", params: { id } }) : navigate({ to: "/" }));
  };

  const active = (topics.data ?? []).filter((topic) => !topic.archived);
  const archived = (topics.data ?? []).filter((topic) => topic.archived);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Go to"
      description="Jump to a conversation or start a topic"
    >
      <Command>
        <CommandInput placeholder="Jump to a conversation…" />
        <CommandList>
          <CommandEmpty>Nothing matches.</CommandEmpty>
          <CommandGroup heading="Conversations">
            <CommandItem value="main conversation" onSelect={() => go()}>
              <MessageSquareIcon /> Main conversation
            </CommandItem>
            {active.map((topic) => {
              const tone = topicTone(topic);
              return (
                <CommandItem key={topic.id} value={`${topic.title} ${topic.summary}`} onSelect={() => go(topic.id)}>
                  <StatusDot tone={tone} />
                  <span className="truncate">{topic.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{TONE_LABEL[tone]}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {archived.length ? (
            <CommandGroup heading="Archived">
              {archived.map((topic) => (
                <CommandItem key={topic.id} value={`${topic.title} archived`} onSelect={() => go(topic.id)}>
                  <StatusDot tone="archived" />
                  <span className="truncate">{topic.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem
              value="start a topic"
              onSelect={() => {
                setOpen(false);
                void navigate({ to: "/" }).then(() => window.dispatchEvent(new CustomEvent(START_TOPIC_EVENT)));
              }}
            >
              <PlusIcon /> Start a topic
              <span className="ml-auto text-xs text-muted-foreground">Ask the assistant</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
