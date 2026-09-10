import assert from "node:assert/strict";
import { test } from "node:test";

process.env.OPENMUSE_COOKIE_SECRET = "c".repeat(40);
process.env.OPENMUSE_OWNER_SECRET = "o".repeat(24);
process.env.OPENMUSE_AGENT_SECRET = "a".repeat(40);
process.env.OPENMUSE_INSTALLATION_ID = "test";
process.env.OPENMUSE_APP_ORIGIN = "https://openmuse.test";
process.env.OPENCOMPUTER_PROJECT_ID = "prj_test";
process.env.OPENMUSE_COORDINATOR_AGENT = "c";
process.env.OPENMUSE_WORKER_AGENT = "w";
process.env.OPENCOMPUTER_API_KEY = "k";

const { issueSession, verifySession } = await import("../lib/auth/cookie");
const { requireAgent, requireOwner, sameOrigin } = await import("../lib/auth/guard");
const { loginAllowed, recordLoginFailure } = await import("../lib/auth/rate-limit");

test("session cookie round-trips and expires", () => {
  const { value, session } = issueSession(1_000_000);
  assert.equal(verifySession(value, 1_000_000)?.csrf, session.csrf);
  assert.equal(verifySession(value, 1_000_000 + 8 * 24 * 3600 * 1000), null);
  assert.equal(verifySession(value.slice(0, -2) + "zz"), null);
  assert.equal(verifySession(undefined), null);
});

test("mutations need same origin and the csrf token from the cookie", () => {
  const { value, session } = issueSession();
  const base = { cookie: `om_session=${value}` };
  const read = new Request("https://openmuse.test/api/x", { headers: base });
  assert.equal(requireOwner(read).ok, true);
  const noToken = new Request("https://openmuse.test/api/x", { method: "POST", headers: { ...base, origin: "https://openmuse.test" } });
  assert.equal(requireOwner(noToken, { mutation: true }).ok, false);
  const wrongOrigin = new Request("https://openmuse.test/api/x", { method: "POST", headers: { ...base, origin: "https://evil.test", "x-csrf-token": session.csrf } });
  assert.equal(requireOwner(wrongOrigin, { mutation: true }).ok, false);
  const good = new Request("https://openmuse.test/api/x", { method: "POST", headers: { ...base, origin: "https://openmuse.test", "x-csrf-token": session.csrf } });
  assert.equal(requireOwner(good, { mutation: true }).ok, true);
  assert.equal(sameOrigin(new Request("https://openmuse.test/api/x", { headers: { "sec-fetch-site": "cross-site" } })), false);
});

test("agent routes take the installation secret as a bearer token", () => {
  assert.equal(requireAgent(new Request("https://openmuse.test/api/agent/x", { headers: { authorization: `Bearer ${"a".repeat(40)}` } })), null);
  assert.equal(requireAgent(new Request("https://openmuse.test/api/agent/x", { headers: { authorization: "Bearer nope" } }))?.status, 401);
});

test("login rate limit blocks after five failures in the window", () => {
  const now = 5_000_000;
  for (let i = 0; i < 5; i += 1) { assert.equal(loginAllowed("1.2.3.4", now), true); recordLoginFailure("1.2.3.4", now); }
  assert.equal(loginAllowed("1.2.3.4", now), false);
  assert.equal(loginAllowed("1.2.3.4", now + 16 * 60 * 1000), true);
});
