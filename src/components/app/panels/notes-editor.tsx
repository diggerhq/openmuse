// The topic's notes, editable outside chat. Saves are compare-and-swap on
// the revision the editor loaded: a conflict shows the server's text next to
// the draft and never overwrites it silently.
import { ArchiveIcon, ArchiveRestoreIcon, LockIcon } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { toast } from "sonner";
import { useOwner } from "@/components/app/owner-context";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/client/api";
import { bytes as formatBytes, relativeTime } from "@/lib/client/format";
import { initialNotes, isDirty, type NotesBase, notesReducer } from "@/lib/client/notes-machine";
import { useInvalidate, useTopicAction } from "@/lib/client/queries";
import type { Document } from "@/lib/memory";
import type { TopicDetail } from "@/lib/topics/service";

function base(document: Document): NotesBase {
  return {
    text: document.text,
    summary: document.summary,
    revision: document.revision,
    updatedAt: document.updatedAt,
    writer: document.writer,
  };
}

export function writerLabel(writer: NotesBase["writer"]): string {
  return writer.kind === "agent" ? "the assistant" : "you";
}

export function NotesEditor({ detail, now }: { detail: TopicDetail; now: number }) {
  const { csrf } = useOwner();
  const [state, dispatch] = useReducer(notesReducer, base(detail.document), initialNotes);
  const action = useTopicAction(csrf, detail.topic.id);
  const invalidate = useInvalidate();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const dirty = isDirty(state);
  const frozen = detail.document.agentWrites === "disabled";

  useEffect(() => {
    dispatch({ type: "loaded", base: base(detail.document) });
  }, [detail.document]);

  async function save() {
    dispatch({ type: "save" });
    try {
      const result = await api<{ status: "saved"; revision: string }>(
        csrf,
        `/api/topics/${encodeURIComponent(detail.topic.id)}/notes`,
        {
          method: "PUT",
          body: JSON.stringify({ text: state.draft.text, summary: state.draft.summary, revision: state.base.revision }),
        },
      );
      dispatch({ type: "saved", revision: result.revision, at: Date.now() });
      void invalidate.topic(detail.topic.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && typeof error.body.text === "string") {
        dispatch({
          type: "conflict",
          text: error.body.text,
          summary: String(error.body.summary ?? ""),
          revision: String(error.body.revision ?? ""),
        });
      } else if (error instanceof ApiError && error.status === 422) {
        const reason = String(error.body.reason ?? "");
        dispatch({
          type: "failed",
          error:
            reason === "too_large"
              ? `Too long: the ${error.body.field === "summary" ? "summary" : "notes"} limit is ${formatBytes(Number(error.body.maxBytes ?? 0))}.`
              : `Not saved (${reason || "refused"}).`,
        });
      } else {
        dispatch({ type: "failed", error: error instanceof Error ? error.message : "Not saved." });
      }
    }
  }

  async function setArchived(archived: boolean) {
    try {
      await action.mutateAsync({ path: "archive", body: { archived, revision: state.base.revision } });
      toast.success(
        archived
          ? "Archived. The notes are frozen and the computer is released."
          : "Unarchived. The next task starts a fresh computer.",
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "The notes changed meanwhile. Reload and try again."
          : error instanceof Error
            ? error.message
            : "Could not change the topic",
      );
    }
  }

  const statusLine = (() => {
    if (state.status === "saving") return "Saving…";
    if (state.status === "error") return state.error ?? "Not saved.";
    if (state.status === "conflict") return "Not saved: someone else saved first.";
    if (dirty) return "Unsaved changes";
    if (state.status === "saved" && state.savedAt)
      return `Saved ${relativeTime(new Date(state.savedAt).toISOString(), now)}`;
    return `Saved ${relativeTime(state.base.updatedAt, now)} by ${writerLabel(state.base.writer)}`;
  })();

  return (
    <section className="space-y-3 border-b p-4" aria-labelledby="notes-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notes-heading" className="text-sm font-semibold">
          Notes
        </h2>
        <div className="flex items-center gap-1.5">
          {frozen ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <LockIcon className="size-3" aria-hidden /> Frozen
            </Badge>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground" title={`Version ${state.base.revision}`}>
            {state.base.revision.slice(0, 8)}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes-summary" className="text-xs text-muted-foreground">
          One-line summary
        </Label>
        <Input
          id="notes-summary"
          value={state.draft.summary}
          onChange={(event) => dispatch({ type: "edit", summary: event.target.value })}
          maxLength={240}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes-text" className="text-xs text-muted-foreground">
          What the assistant knows about this topic
        </Label>
        <Textarea
          id="notes-text"
          value={state.draft.text}
          onChange={(event) => dispatch({ type: "edit", text: event.target.value })}
          rows={12}
          className="min-h-48 font-mono text-xs leading-relaxed"
          aria-describedby="notes-status"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!dirty || state.status === "saving" || state.status === "conflict"}
        >
          {state.status === "saving" ? "Saving…" : "Save notes"}
        </Button>
        {dirty && state.status !== "saving" ? (
          <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "discard" })}>
            Discard
          </Button>
        ) : null}
        <span
          id="notes-status"
          className={`text-xs ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
          role="status"
        >
          {statusLine}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {formatBytes(new TextEncoder().encode(state.draft.text).length)} of {formatBytes(detail.document.maxBytes)}
        </span>
      </div>

      {state.behind && !state.conflict ? (
        <div
          className="rounded-md border border-status-attention/40 bg-status-attention-bg p-3 text-xs text-status-attention"
          role="status"
        >
          These notes changed on the server {relativeTime(state.behind.updatedAt, now)} (saved by{" "}
          {writerLabel(state.behind.writer)}) while you were editing. Saving will show you both versions.
          <div className="mt-2 flex gap-2">
            <Button size="xs" variant="outline" onClick={() => dispatch({ type: "take-server" })}>
              Load their version
            </Button>
          </div>
        </div>
      ) : null}

      {state.conflict ? (
        <div className="space-y-2 rounded-md border border-status-attention/40 bg-status-attention-bg p-3" role="alert">
          <p className="text-xs font-medium text-status-attention">
            Someone else saved first. Their text is below; yours is still in the editor.
          </p>
          <pre className="max-h-40 overflow-auto rounded-md border bg-card p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
            {state.conflict.text}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" onClick={() => dispatch({ type: "take-server" })}>
              Use their text
            </Button>
            <Button size="xs" variant="outline" onClick={() => dispatch({ type: "keep-mine" })}>
              Keep mine, then save over it
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        {detail.topic.archived ? (
          <Button size="sm" variant="outline" onClick={() => void setArchived(false)} disabled={action.isPending}>
            <ArchiveRestoreIcon /> Unarchive
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirmArchive(true)} disabled={action.isPending}>
            <ArchiveIcon /> Archive
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">
          {detail.topic.archived
            ? "Archived: the assistant can't change these notes."
            : "Freezes the notes and releases the computer."}
        </span>
      </div>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{detail.topic.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The assistant can no longer change these notes and the topic's computer is released. You can unarchive
              later; the next task then starts a fresh computer from these notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void setArchived(true)}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
