// INTERIM STORAGE. The topic index (state/store.ts) and the fixture notes
// (memory/fixture-store.ts) keep small JSON documents in one key-value blob
// store. This whole directory disappears when memory documents carry the
// topics themselves: the memory inventory becomes the index and the session
// map moves into the topic documents.
//
// Backends, selected by OPENMUSE_STATE_STORE:
//   fs      JSON files under OPENMUSE_STATE_DIR (Node hosts; the default)
//   kv      a Workers KV namespace bound as OPENMUSE_STORE (Cloudflare)
//   memory  a Map in the process; lost on restart, warns at startup
export interface BlobStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  /** Keys under a prefix, sorted. */
  list(prefix: string): Promise<string[]>;
}

const KEY = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

export function assertKey(key: string): string {
  if (!KEY.test(key) || key.split("/").some((part) => part === "." || part === ".."))
    throw new Error(`invalid store key ${key}`);
  return key;
}
