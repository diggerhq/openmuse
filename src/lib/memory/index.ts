// Project memory: the documents the agents read through their session
// bindings and save with memory_save, as the owner sees and edits them. This
// is the app's client for the management API's memory routes
// (docs/agents/document-memory.mdx, "Management API"): compare-and-swap on
// the opaque revision carried as ETag, typed outcomes instead of thrown
// errors for the results a caller reconciles (a stale revision, a frozen or
// deleted document, a field over its limit). Agent saves never come through
// here; the platform's memory_save holds the session's own expected revision.
import type { MemoryDocument, MemoryDocumentMeta, MemoryDocumentPage } from "@opencomputer/sdk";
import { utf8ByteLength } from "@/lib/crypto";
import { env } from "@/lib/env";

/** The two resources both agents declare (scripts/templates/memory.ts). */
export type Resource = "profile" | "topics";

export type Document = MemoryDocument;
export type DocumentMeta = MemoryDocumentMeta;

export type SaveResult =
  | { readonly status: "saved"; readonly revision: string; readonly bytes: number }
  | { readonly status: "conflict"; readonly text: string; readonly summary: string; readonly revision: string }
  | { readonly status: "rejected"; readonly reason: "not_found" }
  | {
      readonly status: "rejected";
      readonly reason: "too_large";
      readonly field: "text" | "summary";
      readonly bytes: number;
      readonly maxBytes: number;
    };

export type CreateResult =
  | { readonly status: "created"; readonly document: Document }
  | { readonly status: "exists"; readonly document: Document }
  /** The id was deleted and stays reserved; a session cannot bind it. */
  | { readonly status: "deleted" };

export const SUMMARY_MAX_BYTES = 240;
export const TITLE_MAX_BYTES = 240;

export function documentIdValid(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function base(resource: Resource): string {
  return `${env().apiUrl}/api/managed-agents/projects/${encodeURIComponent(env().projectId)}/memory/${resource}/documents`;
}

function url(resource: Resource, id?: string, query: Record<string, string> = {}): string {
  const search = new URLSearchParams({ environment: env().environment, ...query });
  return `${base(resource)}${id === undefined ? "" : `/${encodeURIComponent(id)}`}?${search}`;
}

export class MemoryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call(
  target: string,
  init: RequestInit = {},
): Promise<{ status: number; etag: string | null; body: unknown }> {
  const response = await fetch(target, {
    ...init,
    headers: {
      "x-api-key": env().apiKey,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    // Never follow a redirect with the key attached.
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new MemoryError(response.status, "redirect", `memory ${target} redirected`);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, etag: response.headers.get("etag"), body };
}

function unexpected(operation: string, result: { status: number; body: unknown }): MemoryError {
  const error = (result.body as { error?: { code?: string; message?: string } } | null)?.error;
  return new MemoryError(
    result.status,
    error?.code ?? `http_${result.status}`,
    error?.message ?? `memory ${operation} failed (${result.status})`,
  );
}

// The revision travels quoted as an ETag; If-Match wants it the same way.
function quoted(revision: string): string {
  return revision.startsWith('"') ? revision : `"${revision}"`;
}

async function conflictOrMissing(resource: Resource, id: string): Promise<SaveResult> {
  const current = await memory.get(resource, id);
  return current
    ? { status: "conflict", text: current.text, summary: current.summary, revision: current.revision }
    : { status: "rejected", reason: "not_found" };
}

// 413 names the field and both sizes in its message ("text is 9000 bytes;
// the limit is 8192 bytes"); when it does not, the text and its document's
// limit are the answer.
async function tooLarge(
  resource: Resource,
  id: string,
  body: { text: string },
  result: { body: unknown },
): Promise<SaveResult> {
  const message = (result.body as { error?: { message?: string } } | null)?.error?.message ?? "";
  const named = /^(text|summary) is (\d+) bytes; the limit is (\d+) bytes$/.exec(message);
  if (named) {
    return {
      status: "rejected",
      reason: "too_large",
      field: named[1] as "text" | "summary",
      bytes: Number(named[2]),
      maxBytes: Number(named[3]),
    };
  }
  const current = await memory.get(resource, id);
  return {
    status: "rejected",
    reason: "too_large",
    field: "text",
    bytes: utf8ByteLength(body.text),
    maxBytes: current?.maxBytes ?? 0,
  };
}

export const memory = {
  /** Every document's metadata, newest update first, following the pages. */
  async list(resource: Resource): Promise<DocumentMeta[]> {
    const documents: DocumentMeta[] = [];
    let cursor: string | null = null;
    do {
      const result = await call(url(resource, undefined, cursor ? { cursor } : {}));
      if (result.status !== 200) throw unexpected("list", result);
      const page = result.body as MemoryDocumentPage;
      documents.push(...page.documents);
      cursor = page.nextCursor;
    } while (cursor);
    return documents;
  },

  /** The document, or null when it does not exist or was deleted. */
  async get(resource: Resource, id: string): Promise<Document | null> {
    if (!documentIdValid(id)) return null;
    const result = await call(url(resource, id));
    if (result.status === 404) return null;
    if (result.status !== 200) throw unexpected("read", result);
    return result.body as Document;
  },

  /** Conditional create (`If-None-Match: *`): an existing document is left as it is. */
  async create(
    resource: Resource,
    id: string,
    body: { title: string; text?: string; summary?: string },
  ): Promise<CreateResult> {
    if (!documentIdValid(id)) throw new MemoryError(400, "invalid_request", "invalid document id");
    const result = await call(url(resource, id), {
      method: "PUT",
      headers: { "if-none-match": "*" },
      body: JSON.stringify({ title: body.title, text: body.text ?? "", summary: body.summary ?? "" }),
    });
    if (result.status === 201) return { status: "created", document: result.body as Document };
    if (result.status === 412) {
      const document = await memory.get(resource, id);
      return document ? { status: "exists", document } : { status: "deleted" };
    }
    throw unexpected("create", result);
  },

  /** Owner replace of text (and optionally summary) if `expectedRevision` is current. */
  async replace(
    resource: Resource,
    id: string,
    body: { text: string; summary?: string },
    expectedRevision: string,
  ): Promise<SaveResult> {
    const result = await call(url(resource, id), {
      method: "PUT",
      headers: { "if-match": quoted(expectedRevision) },
      body: JSON.stringify(body.summary === undefined ? { text: body.text } : body),
    });
    if (result.status === 200) {
      const document = result.body as Document;
      return { status: "saved", revision: document.revision, bytes: document.bytes };
    }
    if (result.status === 412) return conflictOrMissing(resource, id);
    if (result.status === 404) return { status: "rejected", reason: "not_found" };
    if (result.status === 413) return tooLarge(resource, id, body, result);
    throw unexpected("replace", result);
  },

  /** Owner patch of the title and the agent write policy. */
  async patch(
    resource: Resource,
    id: string,
    patch: { title?: string; agentWrites?: "enabled" | "disabled" },
    expectedRevision: string,
  ): Promise<SaveResult> {
    const result = await call(url(resource, id), {
      method: "PATCH",
      headers: { "if-match": quoted(expectedRevision) },
      body: JSON.stringify(patch),
    });
    if (result.status === 200) {
      const document = result.body as Document;
      return { status: "saved", revision: document.revision, bytes: document.bytes };
    }
    if (result.status === 412) return conflictOrMissing(resource, id);
    if (result.status === 404) return { status: "rejected", reason: "not_found" };
    throw unexpected("patch", result);
  },
};
