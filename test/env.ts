// Test environment: every required variable set, an in-memory blob store.
import { resetEnvCache } from "@/lib/env";
import { resetFixtureSeed } from "@/lib/memory/fixture-store";
import { setBlobStore } from "@/lib/store";
import { memoryBlobStore } from "@/lib/store/memory";

export function testEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, {
    OPENMUSE_COOKIE_SECRET: "c".repeat(40),
    OPENMUSE_OWNER_SECRET: "o".repeat(24),
    OPENMUSE_AGENT_SECRET: "a".repeat(40),
    OPENMUSE_INSTALLATION_ID: "test",
    OPENMUSE_APP_ORIGIN: "https://openmuse.test",
    OPENCOMPUTER_PROJECT_ID: "prj_test",
    OPENMUSE_COORDINATOR_AGENT: "c",
    OPENMUSE_WORKER_AGENT: "w",
    OPENCOMPUTER_API_KEY: "k",
    OPENMUSE_STATE_STORE: "memory",
    ...overrides,
  });
  resetEnvCache();
  setBlobStore(memoryBlobStore());
  resetFixtureSeed();
}
