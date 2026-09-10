// Memory adapter, agent side (coordinator).
//
// Today the app writes the current profile document and the topic overview
// into this session's data before every turn (lib/memory/recall.ts), and this
// module projects them in the same shape the platform's useMemory() will
// return. When project memory lands, the body of each hook becomes one line:
//   useMemory(profile) / useMemory(topics)
// and the fixture fallback plus the app-side recall are deleted.
import { useSessionData, type DataValue } from "@opencomputer/agent";
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

interface RecalledOverview {
  readonly text: string;
  readonly sources: readonly MemorySource[];
}

interface CoordinatorRecall {
  readonly profile?: RecalledDocument;
  readonly overview?: RecalledOverview;
}

function recall(): CoordinatorRecall {
  const value = useSessionData<DataValue>("memory");
  return (value ?? {}) as unknown as CoordinatorRecall;
}

export function useProfile(): MemoryProjection {
  const doc = recall().profile;
  if (!doc) return { text: fixtureProfile, sources: [], writable: false };
  return {
    text: doc.text,
    sources: [{ id: doc.id, title: doc.title, revision: doc.revision, updatedAt: doc.updatedAt }],
    writable: doc.writable,
  };
}

export function useTopicsOverview(): MemoryProjection {
  const overview = recall().overview;
  if (!overview) return { text: fixtureTopicsOverview, sources: [], writable: false };
  return { text: overview.text, sources: overview.sources, writable: false };
}
