import assert from "node:assert/strict";
import { afterEach, beforeAll, test, vi } from "vitest";
import { installationOrigin, registerInstallation } from "@/lib/oc/installation";
import { testEnv } from "./env";

beforeAll(() => testEnv());
afterEach(() => vi.restoreAllMocks());

function stubPlatform(status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(status === 200 ? "{}" : JSON.stringify({ error: { code: "nope", message: "no" } }), {
      status,
    });
  });
  return calls;
}

test("sign-in registers the installation secret for the https origin", async () => {
  const calls = stubPlatform();
  assert.equal(await registerInstallation("https://openmuse.example"), "registered");
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "https://app.opencomputer.dev/api/managed-agents/projects/prj_test/secrets/OPENMUSE_AGENT_SECRET",
  );
  assert.equal(calls[0]?.init.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
    value: "a".repeat(40),
    environment: "development",
    allowedOrigins: ["https://openmuse.example"],
  });
});

test("a plain-http origin is not registered and a platform failure does not throw", async () => {
  const calls = stubPlatform(500);
  assert.equal(await registerInstallation("http://localhost:3100"), "skipped");
  assert.equal(calls.length, 0);
  assert.equal(await registerInstallation("https://openmuse.example"), "failed");
  assert.equal(calls.length, 1);
});

test("OPENMUSE_APP_ORIGIN wins over the request origin when set", () => {
  const request = new Request("https://openmuse-abcd.onrender.com/api/auth/login", { method: "POST" });
  assert.equal(installationOrigin(request), "https://openmuse.test");
  testEnv({ OPENMUSE_APP_ORIGIN: "" });
  assert.equal(installationOrigin(request), "https://openmuse-abcd.onrender.com");
  testEnv();
});
