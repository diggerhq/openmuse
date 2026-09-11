import { createFileRoute } from "@tanstack/react-router";
import { TopicConversation } from "@/components/app/topic-conversation";

export const Route = createFileRoute("/_app/topics/$id")({
  component: TopicPage,
});

function TopicPage() {
  const { id } = Route.useParams();
  return <TopicConversation key={id} id={id} />;
}
