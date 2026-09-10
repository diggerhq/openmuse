// Recall, app side. Before every turn the app reads the current documents and
// puts a projection in front of the agent. The platform will do this itself
// (bindings + useMemory); until then the projection travels inside the turn
// input as a marked block that the agent-side adapter parses out and the UI
// strips from the owner's message. Nothing outside this module and the two
// agent memory/index.ts files knows the block exists.
import { memory, type Document, type DocumentMeta } from "@/lib/memory";
import { composeInput } from "@/lib/memory/envelope";

export interface RecalledDocument {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly revision: string;
  readonly updatedAt: string;
  readonly writable: boolean;
}

export interface Recall {
  readonly profile?: RecalledDocument;
  readonly topic?: RecalledDocument;
  readonly overview?: { readonly text: string; readonly sources: Array<{ id: string; title: string; revision: string; updatedAt: string }> };
}

function project(document: Document, access: "read" | "read-write"): RecalledDocument {
  return {
    id: document.id, title: document.title, text: document.text, revision: document.revision, updatedAt: document.updatedAt,
    writable: access === "read-write" && document.agentWrites === "enabled",
  };
}

// One fixed line per document, newest first, as the platform's collection overview.
export function overviewLine(document: DocumentMeta): string {
  return `${document.id} | ${document.title} | ${document.summary} | ${document.updatedAt.slice(0, 10)}`;
}

export async function recallForCoordinator(): Promise<Recall> {
  const [profile, topics] = await Promise.all([memory().get("profile", "owner"), memory().list("topics")]);
  return {
    ...(profile ? { profile: project(profile, "read-write") } : {}),
    overview: {
      text: topics.slice(0, 50).map(overviewLine).join("\n"),
      sources: topics.slice(0, 50).map((t) => ({ id: t.id, title: t.title, revision: t.revision, updatedAt: t.updatedAt })),
    },
  };
}

export async function recallForWorker(topicId: string): Promise<Recall> {
  const [profile, topic] = await Promise.all([memory().get("profile", "owner"), memory().get("topics", topicId)]);
  return {
    ...(profile ? { profile: project(profile, "read") } : {}),
    ...(topic ? { topic: project(topic, "read-write") } : {}),
  };
}

export function composeTurnInput(recall: Recall, text: string): string {
  return composeInput(recall, text);
}
