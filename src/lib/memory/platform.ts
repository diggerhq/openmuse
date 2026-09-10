// MemoryStore over the platform's document-memory management API (contract
// C2, docs/agents/document-memory.mdx on branch docs/memory). Written against
// the documented routes before they exist; select it with OPENMUSE_MEMORY=platform
// once /api/managed-agents/projects/<id>/memory/... responds. UNTESTED until then.
import { utf8ByteLength } from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  type CreateResult,
  type Document,
  type DocumentMeta,
  documentIdValid,
  LIMITS,
  type MemoryStore,
  type Resource,
  type SaveResult,
  type Writer,
} from "@/lib/memory/adapter";

function base(resource: Resource): string {
  return `${env().apiUrl}/api/managed-agents/projects/${encodeURIComponent(env().projectId)}/memory/${resource}/documents`;
}

async function call(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; etag: string | null; body: unknown }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "x-api-key": env().apiKey,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error(`memory ${url} redirected (${response.status})`);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, etag: response.headers.get("etag"), body };
}

function quoted(revision: string): string {
  return revision.startsWith('"') ? revision : `"${revision}"`;
}

function asDocument(resource: Resource, body: unknown): Document {
  const value = body as Omit<Document, "resource">;
  return { resource, ...value, maxBytes: value.maxBytes ?? LIMITS[resource] };
}

const environment = () => `environment=${encodeURIComponent(env().environment)}`;

export const platformStore: MemoryStore = {
  async list(resource) {
    const documents: DocumentMeta[] = [];
    let cursor: string | null = null;
    do {
      const result = await call(
        `${base(resource)}?${environment()}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (result.status !== 200) throw new Error(`memory list failed (${result.status})`);
      const page = result.body as { documents: Array<Omit<DocumentMeta, "resource">>; nextCursor: string | null };
      documents.push(...page.documents.map((document) => ({ resource, ...document })));
      cursor = page.nextCursor;
    } while (cursor);
    return documents;
  },
  async get(resource, id) {
    if (!documentIdValid(id)) return null;
    const result = await call(`${base(resource)}/${encodeURIComponent(id)}?${environment()}`);
    if (result.status === 404) return null;
    if (result.status !== 200) throw new Error(`memory read failed (${result.status})`);
    return asDocument(resource, result.body);
  },
  async create(resource, id, body): Promise<CreateResult> {
    const result = await call(`${base(resource)}/${encodeURIComponent(id)}?${environment()}`, {
      method: "PUT",
      headers: { "if-none-match": "*" },
      body: JSON.stringify({ title: body.title, text: body.text, summary: body.summary ?? "" }),
    });
    if (result.status === 201) return { status: "created", document: asDocument(resource, result.body) };
    if (result.status === 412) return { status: "exists" };
    throw new Error(`memory create failed (${result.status})`);
  },
  async replace(resource, id, body, expectedRevision, _writer: Writer): Promise<SaveResult> {
    // Owner writes only: agent saves go through the platform's memory_save
    // tool, which holds the session's own expected revision.
    const result = await call(`${base(resource)}/${encodeURIComponent(id)}?${environment()}`, {
      method: "PUT",
      headers: { "if-match": quoted(expectedRevision) },
      body: JSON.stringify(body.summary === undefined ? { text: body.text } : body),
    });
    if (result.status === 200) {
      const document = asDocument(resource, result.body);
      return { status: "saved", revision: document.revision, bytes: document.bytes };
    }
    if (result.status === 412) {
      const current = await platformStore.get(resource, id);
      return current
        ? { status: "conflict", text: current.text, summary: current.summary, revision: current.revision }
        : { status: "rejected", reason: "not_found" };
    }
    if (result.status === 404) return { status: "rejected", reason: "not_found" };
    if (result.status === 413)
      return { status: "rejected", reason: "too_large", bytes: utf8ByteLength(body.text), maxBytes: LIMITS[resource] };
    throw new Error(`memory replace failed (${result.status})`);
  },
  async patch(resource, id, patch, expectedRevision): Promise<SaveResult> {
    const result = await call(`${base(resource)}/${encodeURIComponent(id)}?${environment()}`, {
      method: "PATCH",
      headers: { "if-match": quoted(expectedRevision) },
      body: JSON.stringify(patch),
    });
    if (result.status === 200) {
      const document = asDocument(resource, result.body);
      return { status: "saved", revision: document.revision, bytes: document.bytes };
    }
    if (result.status === 412) {
      const current = await platformStore.get(resource, id);
      return current
        ? { status: "conflict", text: current.text, summary: current.summary, revision: current.revision }
        : { status: "rejected", reason: "not_found" };
    }
    if (result.status === 404) return { status: "rejected", reason: "not_found" };
    throw new Error(`memory patch failed (${result.status})`);
  },
};
