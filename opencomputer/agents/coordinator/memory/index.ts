// Memory adapter, agent side (coordinator).
//
// Today the app recalls the current profile document and the topic overview
// before every turn and carries the projection inside the turn input as a
// marked block (lib/memory/recall.ts); this module parses it out and projects
// it in the shape the platform's useMemory() will return. When project memory
// lands, each hook becomes one line, useMemory(profile) / useMemory(topics),
// useMessage() becomes useInput().text, and the fixture fallback is deleted.
import { useInput } from "@opencomputer/agent";
import { fixtureProfile, fixtureTopicsOverview } from "./fixtures.generated.js";

export interface MemorySource {
  readonly id: string;
  readonly title: string;
  readonly revision: string;
  readonly updatedAt: string;
}

export interface MemoryProjection {
  readonly text: string;
  readonly sources: readonly MemorySource[];
  readonly writable: boolean;
}

interface RecalledDocument {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly revision: string;
  readonly updatedAt: string;
  readonly writable: boolean;
}

interface Recall {
  readonly profile?: RecalledDocument;
  readonly overview?: { readonly text: string; readonly sources: readonly MemorySource[] };
}

const OPEN = "<openmuse-recall>";
const CLOSE = "</openmuse-recall>";

function parse(): { recall: Recall; message: string } {
  const text = useInput().text ?? "";
  if (!text.startsWith(OPEN)) return { recall: {}, message: text };
  const end = text.indexOf(CLOSE);
  if (end === -1) return { recall: {}, message: text };
  let recall: Recall = {};
  try {
    recall = JSON.parse(text.slice(OPEN.length, end)) as Recall;
  } catch {
    recall = {};
  }
  return { recall, message: text.slice(end + CLOSE.length).replace(/^\s+/, "") };
}

/** The owner's (or the app's) message without the recall block. */
export function useMessage(): string {
  return parse().message;
}

export function useProfile(): MemoryProjection {
  const doc = parse().recall.profile;
  if (!doc) return { text: fixtureProfile, sources: [], writable: false };
  return {
    text: doc.text,
    sources: [{ id: doc.id, title: doc.title, revision: doc.revision, updatedAt: doc.updatedAt }],
    writable: doc.writable,
  };
}

export function useTopicsOverview(): MemoryProjection {
  const overview = parse().recall.overview;
  if (!overview) return { text: fixtureTopicsOverview, sources: [], writable: false };
  return { text: overview.text, sources: overview.sources, writable: false };
}
