// FIXTURE implementation of MemoryStore: one JSON file per document under
// <state dir>/memory/<resource>/<id>.json, seeded from fixtures/notes on first
// use. Same revision, limit and policy behaviour as the platform contract so
// the rest of the app does not change when platform.ts replaces it.
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";
import { LIMITS, SUMMARY_MAX_BYTES, documentIdValid, type CreateResult, type Document, type DocumentMeta, type MemoryStore, type Resource, type SaveResult, type Writer } from "@/lib/memory/adapter";

const utf8 = (text: string) => Buffer.byteLength(text, "utf8");
const revision = () => randomBytes(8).toString("hex");

let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

function directory(resource: Resource): string {
  return join(env().stateDir, "memory", resource);
}

function parseNote(source: string): { title: string; summary: string; text: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: "Untitled", summary: "", text: source.trim() };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index > 0) meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return { title: meta.title ?? "Untitled", summary: meta.summary ?? "", text: match[2].trim() };
}

let seeded = false;
async function seed(): Promise<void> {
  if (seeded) return;
  seeded = true;
  const fixtures = join(process.cwd(), "fixtures", "notes");
  const now = new Date().toISOString();
  const write = async (resource: Resource, id: string, note: { title: string; summary: string; text: string }) => {
    await mkdir(directory(resource), { recursive: true, mode: 0o700 });
    const path = join(directory(resource), `${id}.json`);
    try { await readFile(path); return; } catch { /* missing: seed it */ }
    const document: Document = {
      resource, id, title: note.title, text: note.text, summary: note.summary, agentWrites: "enabled",
      revision: revision(), bytes: utf8(note.text), maxBytes: LIMITS[resource], updatedAt: now, writer: { kind: "owner" },
    };
    await writeFile(path, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 });
  };
  try {
    await write("profile", "owner", parseNote(await readFile(join(fixtures, "profile.md"), "utf8")));
  } catch { /* no profile fixture */ }
  let topicFiles: string[] = [];
  try { topicFiles = (await readdir(join(fixtures, "topics"))).filter((name) => name.endsWith(".md")); } catch { /* none */ }
  for (const name of topicFiles) {
    await write("topics", name.replace(/\.md$/, ""), parseNote(await readFile(join(fixtures, "topics", name), "utf8")));
  }
}

async function readDocument(resource: Resource, id: string): Promise<Document | null> {
  await seed();
  try {
    return JSON.parse(await readFile(join(directory(resource), `${id}.json`), "utf8")) as Document;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeDocument(document: Document): Promise<void> {
  await mkdir(directory(document.resource), { recursive: true, mode: 0o700 });
  const path = join(directory(document.resource), `${document.id}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(document, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
}

function meta(document: Document): DocumentMeta {
  const { text: _text, ...rest } = document;
  return rest;
}

export const fixtureStore: MemoryStore = {
  async list(resource) {
    await seed();
    let names: string[] = [];
    try { names = (await readdir(directory(resource))).filter((name) => name.endsWith(".json")); } catch { return []; }
    const documents = await Promise.all(names.map((name) => readDocument(resource, name.replace(/\.json$/, ""))));
    return documents
      .filter((document): document is Document => Boolean(document))
      .map(meta)
      .sort((a, b) => (a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : b.updatedAt.localeCompare(a.updatedAt)));
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
        resource, id, title: body.title, text: body.text, summary: body.summary ?? "", agentWrites: "enabled",
        revision: revision(), bytes: utf8(body.text), maxBytes: LIMITS[resource], updatedAt: new Date().toISOString(), writer: { kind: "owner" },
      };
      await writeDocument(document);
      return { status: "created", document };
    });
  },
  replace(resource, id, body, expectedRevision, writer: Writer): Promise<SaveResult> {
    return serialized(async () => {
      const current = await readDocument(resource, id);
      if (!current) return { status: "rejected", reason: "not_found" };
      if (writer.kind === "agent" && current.agentWrites === "disabled") return { status: "rejected", reason: "agent_writes_disabled" };
      const bytes = utf8(body.text);
      if (bytes > current.maxBytes) return { status: "rejected", reason: "too_large", bytes, maxBytes: current.maxBytes };
      if (body.summary !== undefined && utf8(body.summary) > SUMMARY_MAX_BYTES) {
        return { status: "rejected", reason: "too_large", bytes: utf8(body.summary), maxBytes: SUMMARY_MAX_BYTES };
      }
      if (current.revision !== expectedRevision) {
        return { status: "conflict", text: current.text, summary: current.summary, revision: current.revision };
      }
      const next: Document = {
        ...current, text: body.text, summary: body.summary ?? current.summary, bytes,
        revision: revision(), updatedAt: new Date().toISOString(), writer,
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
        ...current, title: patch.title ?? current.title, agentWrites: patch.agentWrites ?? current.agentWrites,
        revision: revision(), updatedAt: new Date().toISOString(), writer: { kind: "owner" },
      };
      await writeDocument(next);
      return { status: "saved", revision: next.revision, bytes: next.bytes };
    });
  },
};
