// FIXTURE implementation of MemoryStore: one JSON document per note under
// memory/<resource>/<id>.json in the blob store, seeded from fixtures/notes on
// first use (the note files are bundled at build time). Same revision, limit
// and policy behaviour as the platform contract so the rest of the app does
// not change when platform.ts replaces it.
import { hex, randomBytes, utf8ByteLength } from "@/lib/crypto";
import {
  type CreateResult,
  type Document,
  type DocumentMeta,
  documentIdValid,
  LIMITS,
  type MemoryStore,
  type Resource,
  type SaveResult,
  SUMMARY_MAX_BYTES,
  type Writer,
} from "@/lib/memory/adapter";
import { blobs } from "@/lib/store";
import profileFixture from "../../../fixtures/notes/profile.md?raw";

const topicFixtures = import.meta.glob("../../../fixtures/notes/topics/*.md", {
  query: "?raw",
  eager: true,
  import: "default",
}) as Record<string, string>;

const revision = () => hex(randomBytes(8));

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

const key = (resource: Resource, id: string) => `memory/${resource}/${id}.json`;

export function parseNote(source: string): { title: string; summary: string; text: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: "Untitled", summary: "", text: source.trim() };
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const index = line.indexOf(":");
    if (index > 0) meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { title: meta.title ?? "Untitled", summary: meta.summary ?? "", text: (match[2] ?? "").trim() };
}

let seeded: Promise<void> | undefined;
function seed(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    const now = new Date().toISOString();
    const write = async (resource: Resource, id: string, note: { title: string; summary: string; text: string }) => {
      if (await blobs().get(key(resource, id))) return;
      const document: Document = {
        resource,
        id,
        title: note.title,
        text: note.text,
        summary: note.summary,
        agentWrites: "enabled",
        revision: revision(),
        bytes: utf8ByteLength(note.text),
        maxBytes: LIMITS[resource],
        updatedAt: now,
        writer: { kind: "owner" },
      };
      await blobs().put(key(resource, id), `${JSON.stringify(document, null, 2)}\n`);
    };
    await write("profile", "owner", parseNote(profileFixture));
    for (const [path, source] of Object.entries(topicFixtures).sort()) {
      const id = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
      await write("topics", id, parseNote(source));
    }
  })();
  return seeded;
}

async function readDocument(resource: Resource, id: string): Promise<Document | null> {
  await seed();
  const text = await blobs().get(key(resource, id));
  return text ? (JSON.parse(text) as Document) : null;
}

async function writeDocument(document: Document): Promise<void> {
  await blobs().put(key(document.resource, document.id), `${JSON.stringify(document, null, 2)}\n`);
}

function meta(document: Document): DocumentMeta {
  const { text: _text, ...rest } = document;
  return rest;
}

/** Test seam: forget that the fixtures were seeded (a new store starts empty). */
export function resetFixtureSeed(): void {
  seeded = undefined;
}

export const fixtureStore: MemoryStore = {
  async list(resource) {
    await seed();
    const keys = await blobs().list(`memory/${resource}/`);
    const documents = await Promise.all(
      keys
        .filter((name) => name.endsWith(".json"))
        .map((name) => readDocument(resource, name.slice(name.lastIndexOf("/") + 1, -".json".length))),
    );
    return documents
      .filter((document): document is Document => Boolean(document))
      .map(meta)
      .sort((a, b) =>
        a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : b.updatedAt.localeCompare(a.updatedAt),
      );
  },
  get(resource, id) {
    if (!documentIdValid(id)) return Promise.resolve(null);
    return readDocument(resource, id);
  },
  create(resource, id, body): Promise<CreateResult> {
    return serialized(async () => {
      if (!documentIdValid(id)) throw new Error("invalid document id");
      if (await readDocument(resource, id)) return { status: "exists" };
      const document: Document = {
        resource,
        id,
        title: body.title,
        text: body.text,
        summary: body.summary ?? "",
        agentWrites: "enabled",
        revision: revision(),
        bytes: utf8ByteLength(body.text),
        maxBytes: LIMITS[resource],
        updatedAt: new Date().toISOString(),
        writer: { kind: "owner" },
      };
      await writeDocument(document);
      return { status: "created", document };
    });
  },
  replace(resource, id, body, expectedRevision, writer: Writer): Promise<SaveResult> {
    return serialized(async () => {
      const current = await readDocument(resource, id);
      if (!current) return { status: "rejected", reason: "not_found" };
      if (writer.kind === "agent" && current.agentWrites === "disabled")
        return { status: "rejected", reason: "agent_writes_disabled" };
      const bytes = utf8ByteLength(body.text);
      if (bytes > current.maxBytes)
        return { status: "rejected", reason: "too_large", bytes, maxBytes: current.maxBytes };
      if (body.summary !== undefined && utf8ByteLength(body.summary) > SUMMARY_MAX_BYTES) {
        return {
          status: "rejected",
          reason: "too_large",
          bytes: utf8ByteLength(body.summary),
          maxBytes: SUMMARY_MAX_BYTES,
        };
      }
      if (current.revision !== expectedRevision) {
        return { status: "conflict", text: current.text, summary: current.summary, revision: current.revision };
      }
      const next: Document = {
        ...current,
        text: body.text,
        summary: body.summary ?? current.summary,
        bytes,
        revision: revision(),
        updatedAt: new Date().toISOString(),
        writer,
      };
      await writeDocument(next);
      return { status: "saved", revision: next.revision, bytes };
    });
  },
  patch(resource, id, patch, expectedRevision): Promise<SaveResult> {
    return serialized(async () => {
      const current = await readDocument(resource, id);
      if (!current) return { status: "rejected", reason: "not_found" };
      if (current.revision !== expectedRevision) {
        return { status: "conflict", text: current.text, summary: current.summary, revision: current.revision };
      }
      const next: Document = {
        ...current,
        title: patch.title ?? current.title,
        agentWrites: patch.agentWrites ?? current.agentWrites,
        revision: revision(),
        updatedAt: new Date().toISOString(),
        writer: { kind: "owner" },
      };
      await writeDocument(next);
      return { status: "saved", revision: next.revision, bytes: next.bytes };
    });
  },
};
