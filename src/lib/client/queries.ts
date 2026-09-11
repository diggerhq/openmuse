// TanStack Query keys and hooks for the app's read routes. Live conversation
// events come from @opencomputer/react; these cover everything else.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import type { Document } from "@/lib/memory";
import type { TopicDetail, TopicSummary } from "@/lib/topics/service";

export const keys = {
  topics: ["topics"] as const,
  topic: (id: string) => ["topics", id] as const,
  conversation: ["conversation"] as const,
  profile: ["profile"] as const,
};

export function useTopics(csrf: string) {
  return useQuery({
    queryKey: keys.topics,
    queryFn: () => api<{ topics: TopicSummary[] }>(csrf, "/api/topics").then((result) => result.topics),
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

export function useTopic(csrf: string, id: string) {
  return useQuery({
    queryKey: keys.topic(id),
    queryFn: () => api<TopicDetail>(csrf, `/api/topics/${encodeURIComponent(id)}`),
    refetchInterval: 15_000,
    staleTime: 2_000,
  });
}

export function useConversation(csrf: string) {
  return useQuery({
    queryKey: keys.conversation,
    queryFn: () => api<{ sessionId: string }>(csrf, "/api/conversation"),
    staleTime: 60_000,
    retry: 2,
  });
}

export function useProfile(csrf: string) {
  return useQuery({
    queryKey: keys.profile,
    queryFn: () => api<{ document: Document | null }>(csrf, "/api/profile").then((result) => result.document),
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

export function useInvalidate() {
  const client = useQueryClient();
  return {
    topics: () => client.invalidateQueries({ queryKey: keys.topics }),
    topic: (id: string) =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.topic(id) }),
        client.invalidateQueries({ queryKey: keys.topics }),
      ]),
    conversation: () => client.invalidateQueries({ queryKey: keys.conversation }),
    profile: () => client.invalidateQueries({ queryKey: keys.profile }),
  };
}

export function useTopicAction(csrf: string, id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (action: { path: "archive" | "replace-worker" | "turns" | "rename"; body?: unknown }) =>
      api<Record<string, unknown>>(csrf, `/api/topics/${encodeURIComponent(id)}/${action.path}`, {
        method: "POST",
        ...(action.body !== undefined ? { body: JSON.stringify(action.body) } : {}),
      }),
    onSettled: () => invalidate.topic(id),
  });
}
