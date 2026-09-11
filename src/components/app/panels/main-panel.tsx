// Beside the main conversation: what the assistant knows about the owner,
// and which topics are busy right now.
import { Link } from "@tanstack/react-router";
import { Markdown } from "@/components/app/conversation/markdown";
import { useOwner } from "@/components/app/owner-context";
import { StatusDot, TONE_LABEL, topicTone } from "@/components/app/topic-status";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/client/format";
import { useProfile, useTopics } from "@/lib/client/queries";

export function MainPanel({ now }: { now: number }) {
  const { csrf } = useOwner();
  const profile = useProfile(csrf);
  const topics = useTopics(csrf);
  const busy = (topics.data ?? []).filter((topic) => {
    const tone = topicTone(topic);
    return tone === "running" || tone === "attention" || tone === "failed";
  });
  return (
    <div>
      <section className="space-y-2 border-b p-4" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-sm font-semibold">
          About you
        </h2>
        {profile.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : profile.data ? (
          <>
            <Markdown text={profile.data.text} className="text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Saved {relativeTime(profile.data.updatedAt, now)} by{" "}
              {profile.data.writer.kind === "agent" ? "the assistant" : "you"}. The assistant updates this as it learns
              your preferences; tell it what to change.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing saved yet. Tell the assistant about yourself and it will remember.
          </p>
        )}
      </section>
      <section className="space-y-2 p-4" aria-labelledby="running-heading">
        <h2 id="running-heading" className="text-sm font-semibold">
          Running now
        </h2>
        {topics.isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : busy.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing is running. Outcomes land here in the conversation when work finishes.
          </p>
        ) : (
          <ul className="space-y-1">
            {busy.map((topic) => {
              const tone = topicTone(topic);
              return (
                <li key={topic.id}>
                  <Link
                    to="/topics/$id"
                    params={{ id: topic.id }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel-2"
                  >
                    <StatusDot tone={tone} />
                    <span className="min-w-0 flex-1 truncate">{topic.title}</span>
                    <span className="text-xs text-muted-foreground">{TONE_LABEL[tone]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
