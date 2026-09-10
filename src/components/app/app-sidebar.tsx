// Left sidebar: the main conversation pinned, then every topic with its
// status, one-line summary and last activity; archived topics folded away.
// Rename and archive live in a context menu. Nothing here creates topics:
// the assistant does.
import { Link, useLocation } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, ChevronRightIcon, MessageSquareIcon, PencilIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useOwner } from "@/components/app/owner-context";
import { StatusDot, TONE_LABEL, topicTone } from "@/components/app/topic-status";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import { useTopicAction, useTopics } from "@/lib/client/queries";
import type { TopicSummary } from "@/lib/topics/service";

function lastActivity(topic: TopicSummary): string {
  const work = topic.work?.lastActivityAt;
  return work && work > topic.updatedAt ? work : topic.updatedAt;
}

export function AppSidebar() {
  const { csrf } = useOwner();
  const topics = useTopics(csrf);
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<TopicSummary | null>(null);
  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  const active = (topics.data ?? []).filter((topic) => !topic.archived);
  const archived = (topics.data ?? []).filter((topic) => topic.archived);

  return (
    <Sidebar collapsible="icon" aria-label="Conversations">
      <SidebarHeader className="h-12 justify-center border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location.pathname === "/"} tooltip="Main conversation" onClick={close}>
              <Link to="/">
                <MessageSquareIcon />
                <span className="font-medium">Main conversation</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Topics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {topics.isPending
                ? [72, 58, 64].map((width) => (
                    <li key={width} className="flex h-9 items-center gap-2 px-2" aria-hidden>
                      <Skeleton className="size-2 rounded-full" />
                      <Skeleton className="h-3 group-data-[collapsible=icon]:hidden" style={{ width: `${width}%` }} />
                    </li>
                  ))
                : null}
              {topics.isError ? (
                <li className="px-2 py-1 text-xs text-destructive group-data-[collapsible=icon]:hidden">
                  Could not load topics.{" "}
                  <button type="button" className="underline" onClick={() => void topics.refetch()}>
                    Retry
                  </button>
                </li>
              ) : null}
              {topics.isSuccess && active.length === 0 ? (
                <li className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  No topics yet. Ask for something that needs a computer and the assistant opens one.
                </li>
              ) : null}
              {active.map((topic) => (
                <TopicRow
                  key={topic.id}
                  topic={topic}
                  active={location.pathname === `/topics/${topic.id}`}
                  onNavigate={close}
                  onRename={() => setRenaming(topic)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {archived.length > 0 ? (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1"
                onClick={() => setShowArchived((value) => !value)}
                aria-expanded={showArchived}
              >
                <ChevronRightIcon
                  className={`size-3.5 transition-transform ${showArchived ? "rotate-90" : ""}`}
                  aria-hidden
                />
                Archived ({archived.length})
              </button>
            </SidebarGroupLabel>
            {showArchived ? (
              <SidebarGroupContent>
                <SidebarMenu>
                  {archived.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      active={location.pathname === `/topics/${topic.id}`}
                      onNavigate={close}
                      onRename={() => setRenaming(topic)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            ) : null}
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <RenameDialog topic={renaming} onClose={() => setRenaming(null)} />
    </Sidebar>
  );
}

function TopicRow({
  topic,
  active,
  onNavigate,
  onRename,
}: {
  topic: TopicSummary;
  active: boolean;
  onNavigate: () => void;
  onRename: () => void;
}) {
  const { csrf } = useOwner();
  const action = useTopicAction(csrf, topic.id);
  const tone = topicTone(topic);
  const detail = useTopicRevision(csrf, topic.id);

  async function toggleArchive() {
    const revision = await detail();
    if (!revision) return;
    try {
      await action.mutateAsync({ path: "archive", body: { archived: !topic.archived, revision } });
      toast.success(topic.archived ? `Unarchived “${topic.title}”` : `Archived “${topic.title}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the topic");
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={active}
            tooltip={`${topic.title} · ${TONE_LABEL[tone]}`}
            className="h-auto items-start py-1.5"
            onClick={onNavigate}
          >
            <Link to="/topics/$id" params={{ id: topic.id }}>
              <StatusDot tone={tone} className="mt-1.5" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{topic.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground" title={lastActivity(topic)}>
                    {relativeTime(lastActivity(topic))}
                  </span>
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {tone === "running"
                    ? "Working now"
                    : tone === "attention"
                      ? "Needs you"
                      : tone === "failed"
                        ? "Last reply failed"
                        : topic.summary || "No summary yet"}
                </span>
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <PencilIcon /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void toggleArchive()}>
          {topic.archived ? (
            <>
              <ArchiveRestoreIcon /> Unarchive
            </>
          ) : (
            <>
              <ArchiveIcon /> Archive
            </>
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// The current revision of a topic's notes, read fresh so the compare-and-swap
// on archive and rename never uses a stale one.
function useTopicRevision(csrf: string, id: string) {
  return async (): Promise<string | undefined> => {
    try {
      const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, { headers: { "x-csrf-token": csrf } });
      const detail = (await response.json()) as { document?: { revision?: string } };
      return detail.document?.revision;
    } catch {
      toast.error("Could not read the topic");
      return undefined;
    }
  };
}

function RenameDialog({ topic, onClose }: { topic: TopicSummary | null; onClose: () => void }) {
  return (
    <Dialog open={topic !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>{topic ? <RenameForm key={topic.id} topic={topic} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  );
}

function RenameForm({ topic, onClose }: { topic: TopicSummary; onClose: () => void }) {
  const { csrf } = useOwner();
  const [title, setTitle] = useState(topic.title);
  const [busy, setBusy] = useState(false);
  const revision = useTopicRevision(csrf, topic.id);
  const action = useTopicAction(csrf, topic.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const current = await revision();
      if (!current) return;
      await action.mutateAsync({ path: "rename", body: { title: title.trim(), revision: current } });
      toast.success("Renamed");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "The notes changed meanwhile; try again."
          : error instanceof Error
            ? error.message
            : "Could not rename",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Rename topic</DialogTitle>
        <DialogDescription>The new name shows in the sidebar and to the assistant.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="rename-title">Title</Label>
        <Input
          id="rename-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
