import type { MemoryStore } from "@/lib/memory/adapter";
import { fixtureStore } from "@/lib/memory/fixture-store";
import { platformStore } from "@/lib/memory/platform";

export type MemoryBackend = "fixture" | "platform";

export function memoryBackend(): MemoryBackend {
  return process.env.OPENMUSE_MEMORY === "platform" ? "platform" : "fixture";
}

export function memory(): MemoryStore {
  return memoryBackend() === "platform" ? platformStore : fixtureStore;
}

export * from "@/lib/memory/adapter";
