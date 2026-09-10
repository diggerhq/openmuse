import { assertKey, type BlobStore } from "@/lib/store/blob";

export function memoryBlobStore(): BlobStore {
  const values = new Map<string, string>();
  return {
    async get(key) {
      return values.get(assertKey(key)) ?? null;
    },
    async put(key, value) {
      values.set(assertKey(key), value);
    },
    async list(prefix) {
      return [...values.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}
