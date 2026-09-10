import { env } from "@/lib/env";
import type { BlobStore } from "@/lib/store/blob";
import { fsBlobStore } from "@/lib/store/fs";
import { kvBlobStore } from "@/lib/store/kv";
import { memoryBlobStore } from "@/lib/store/memory";

let selected: BlobStore | undefined;

export function blobs(): BlobStore {
  if (selected) return selected;
  const { stateStore, stateDir } = env();
  if (stateStore === "kv") selected = kvBlobStore();
  else if (stateStore === "memory") {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "state.memory_store",
        message: "OPENMUSE_STATE_STORE=memory: topics and notes are lost when the process restarts",
      }),
    );
    selected = memoryBlobStore();
  } else selected = fsBlobStore(stateDir);
  return selected;
}

/** Test seam: use a specific store (and forget the selection). */
export function setBlobStore(store: BlobStore | undefined): void {
  selected = store;
}

export type { BlobStore } from "@/lib/store/blob";
