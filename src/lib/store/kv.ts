// Workers KV. Reads are eventually consistent across locations and writes
// are last-writer-wins; the read-modify-write queues in the callers are
// per isolate. For a single-owner app whose requests land in one location
// that is acceptable for the fixture phase, and the store goes away with it.
import { assertKey, type BlobStore } from "@/lib/store/blob";

// The subset of KVNamespace the store uses, typed here so server code does
// not depend on Cloudflare's type package.
export interface KvNamespaceLike {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(options: {
    prefix: string;
    cursor?: string;
  }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean; cursor?: string }>;
}

let bound: KvNamespaceLike | undefined;

/** Called by the Cloudflare server entry with the OPENMUSE_STORE binding. */
export function bindKvNamespace(namespace: KvNamespaceLike): void {
  bound = namespace;
}

export function kvBlobStore(): BlobStore {
  const namespace = () => {
    if (!bound) throw new Error("OPENMUSE_STATE_STORE=kv needs the OPENMUSE_STORE KV binding (see wrangler.jsonc)");
    return bound;
  };
  return {
    get(key) {
      return namespace().get(assertKey(key), "text");
    },
    put(key, value) {
      return namespace().put(assertKey(key), value);
    },
    async list(prefix) {
      const names: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await namespace().list({ prefix, ...(cursor ? { cursor } : {}) });
        names.push(...page.keys.map((key) => key.name));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return names.sort();
    },
  };
}
