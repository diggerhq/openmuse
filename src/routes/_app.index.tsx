import { createFileRoute } from "@tanstack/react-router";
import { MainConversation } from "@/components/app/main-conversation";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "OpenMuse" }] }),
  component: () => <MainConversation />,
});
