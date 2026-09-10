// Memory adapter, agent side (topic worker).
//
// Today the app recalls the owner profile and this topic's notes before every
// turn and carries the projection inside the turn input as a marked block
// (lib/memory/recall.ts); saves go through the save_notes tool over the
// managed connection. When project memory lands, each hook becomes one line,
// useMemory(profile) / useMemory(topics), useMessage() becomes
// useInput().text, save_notes is deleted (the platform supplies memory_save),
// and the fixture fallback goes with it.
import { useInput } from "@opencomputer/agent";
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

interface Recall {
  readonly profile?: RecalledDocument;
  readonly topic?: RecalledDocument;
}

const OPEN = "<openmuse-recall>";
const CLOSE = "</openmuse-recall>";

function parse(): { recall: Recall; message: string } {
  const text = useInput().text ?? "";
  if (!text.startsWith(OPEN)) return { recall: {}, message: text };
  const end = text.indexOf(CLOSE);
  if (end === -1) return { recall: {}, message: text };
  let recall: Recall = {};
  try { recall = JSON.parse(text.slice(OPEN.length, end)) as Recall; } catch { recall = {}; }
  return { recall, message: text.slice(end + CLOSE.length).replace(/^\s+/, "") };
}

function project(doc: RecalledDocument | undefined, fallback: string): MemoryProjection {
  if (!doc) return { text: fallback, sources: [], writable: false };
  return {
    text: doc.text,
    sources: [{ id: doc.id, title: doc.title, revision: doc.revision, updatedAt: doc.updatedAt }],
    writable: doc.writable,
  };
}

/** The task text without the recall block. */
export function useMessage(): string {
  return parse().message;
}

export function useProfile(): MemoryProjection {
  return project(parse().recall.profile, fixtureProfile);
}

export function useTopicNotes(): MemoryProjection {
  return project(parse().recall.topic, "");
}
