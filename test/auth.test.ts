import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import { issueSession, verifySession } from "@/lib/auth/cookie";
import { requireAgent, requireOwner, sameOrigin } from "@/lib/auth/guard";
import { loginAllowed, recordLoginFailure } from "@/lib/auth/rate-limit";
import { base64url, constantTimeEquals, fromBase64url, sha256Hex } from "@/lib/crypto";
import { testEnv } from "./env";

beforeAll(() => testEnv());

test("session cookie round-trips and expires", async () => {
  const { value, session } = await issueSession(1_000_000);
  assert.equal((await verifySession(value, 1_000_000))?.csrf, session.csrf);
  assert.equal(await verifySession(value, 1_000_000 + 8 * 24 * 3600 * 1000), null);
  assert.equal(await verifySession(`${value.slice(0, -2)}zz`), null);
  assert.equal(await verifySession(undefined), null);
});

test("mutations need same origin and the csrf token from the cookie", async () => {
  const { value, session } = await issueSession();
  const base = { cookie: `om_session=${value}` };
  const read = new Request("https://openmuse.test/api/x", { headers: base });
  assert.equal((await requireOwner(read)).ok, true);
  const noToken = new Request("https://openmuse.test/api/x", {
    method: "POST",
    headers: { ...base, origin: "https://openmuse.test" },
  });
  assert.equal((await requireOwner(noToken, { mutation: true })).ok, false);
  const wrongOrigin = new Request("https://openmuse.test/api/x", {
    method: "POST",
    headers: { ...base, origin: "https://evil.test", "x-csrf-token": session.csrf },
  });
  assert.equal((await requireOwner(wrongOrigin, { mutation: true })).ok, false);
  const good = new Request("https://openmuse.test/api/x", {
    method: "POST",
    headers: { ...base, origin: "https://openmuse.test", "x-csrf-token": session.csrf },
  });
  assert.equal((await requireOwner(good, { mutation: true })).ok, true);
  assert.equal(
    sameOrigin(new Request("https://openmuse.test/api/x", { headers: { "sec-fetch-site": "cross-site" } })),
    false,
  );
});

test("agent routes take the installation secret as a bearer token", () => {
  assert.equal(
    requireAgent(
      new Request("https://openmuse.test/api/agent/x", { headers: { authorization: `Bearer ${"a".repeat(40)}` } }),
    ),
    null,
  );
  assert.equal(
    requireAgent(new Request("https://openmuse.test/api/agent/x", { headers: { authorization: "Bearer nope" } }))
      ?.status,
    401,
  );
});

test("login rate limit blocks after five failures in the window", () => {
  const now = 5_000_000;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(loginAllowed("1.2.3.4", now), true);
    recordLoginFailure("1.2.3.4", now);
  }
  assert.equal(loginAllowed("1.2.3.4", now), false);
  assert.equal(loginAllowed("1.2.3.4", now + 16 * 60 * 1000), true);
});

test("web crypto helpers", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual([...fromBase64url(base64url(bytes))], [...bytes]);
  assert.equal(constantTimeEquals("same", "same"), true);
  assert.equal(constantTimeEquals("same", "sam"), false);
  assert.equal(constantTimeEquals("", ""), true);
});
