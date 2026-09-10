// The memory seam. Everything the app needs from project memory is behind
// this interface, in the shape of the document-memory contract (C2): typed
// results, compare-and-swap on an opaque revision, owner and agent writers.
//
// Implementations:
//   fixture-store.ts  today: JSON documents on disk, seeded from fixtures/notes
//   platform.ts       the drop-in over /api/managed-agents/projects/<id>/memory
//                     once the routes land (C2); untested until then.
// select in index.ts.

export type Resource = "profile" | "topics";

export interface Writer {
  readonly kind: "owner" | "agent";
  readonly sessionId?: string;
}

export interface Document {
  readonly resource: Resource;
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly summary: string;
  readonly agentWrites: "enabled" | "disabled";
  readonly revision: string;
  readonly bytes: number;
  readonly maxBytes: number;
  readonly updatedAt: string;
  readonly writer: Writer;
}

export type DocumentMeta = Omit<Document, "text">;

export type SaveResult =
  | { readonly status: "saved"; readonly revision: string; readonly bytes: number }
  | { readonly status: "conflict"; readonly text: string; readonly summary: string; readonly revision: string }
  | { readonly status: "rejected"; readonly reason: "agent_writes_disabled" | "not_found" }
  | { readonly status: "rejected"; readonly reason: "too_large"; readonly bytes: number; readonly maxBytes: number };

export type CreateResult =
  | { readonly status: "created"; readonly document: Document }
  | { readonly status: "exists" | "deleted" };

export interface MemoryStore {
  list(resource: Resource): Promise<DocumentMeta[]>;
  get(resource: Resource, id: string): Promise<Document | null>;
  create(
    resource: Resource,
    id: string,
    body: { title: string; text: string; summary?: string },
  ): Promise<CreateResult>;
  /** Replace text (and optionally summary) if `expectedRevision` is current. */
  replace(
    resource: Resource,
    id: string,
    body: { text: string; summary?: string },
    expectedRevision: string,
    writer: Writer,
  ): Promise<SaveResult>;
  /** Owner-only: title and write policy. */
  patch(
    resource: Resource,
    id: string,
    patch: { title?: string; agentWrites?: "enabled" | "disabled" },
    expectedRevision: string,
  ): Promise<SaveResult>;
}

export const LIMITS = { profile: 4_096, topics: 8_192 } as const;
export const SUMMARY_MAX_BYTES = 240;
export const TITLE_MAX_BYTES = 240;

export function documentIdValid(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}
