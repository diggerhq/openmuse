// Memory adapter, agent side (topic worker).
//
// Today the app writes the current profile and this topic's notes into the
// session's data before every turn (lib/memory/recall.ts) and saves go
// through the save_notes tool over the managed connection. When project
// memory lands, each hook becomes `useMemory(profile)` / `useMemory(topics)`,
// save_notes is deleted (the platform supplies memory_save), and the fixture
// fallback goes with it.
import { useSessionData, type DataValue } from "@opencomputer/agent";
import { fixtureProfile } from "./fixtures.generated.js";

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

interface WorkerRecall {
  readonly profile?: RecalledDocument;
  readonly topic?: RecalledDocument;
}

function recall(): WorkerRecall {
  const value = useSessionData<DataValue>("memory");
  return (value ?? {}) as unknown as WorkerRecall;
}

function project(doc: RecalledDocument | undefined, fallback: string): MemoryProjection {
  if (!doc) return { text: fallback, sources: [], writable: false };
  return {
    text: doc.text,
    sources: [{ id: doc.id, title: doc.title, revision: doc.revision, updatedAt: doc.updatedAt }],
    writable: doc.writable,
  };
}

export function useProfile(): MemoryProjection {
  return project(recall().profile, fixtureProfile);
}

export function useTopicNotes(): MemoryProjection {
  return project(recall().topic, "");
}
