// In-memory login rate limit: 5 failed attempts per client address per 15
// minutes. Per process; enough for a single-owner deployment.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

export function loginAllowed(client: string, now = Date.now()): boolean {
  const recent = (failures.get(client) ?? []).filter((at) => now - at < WINDOW_MS);
  failures.set(client, recent);
  return recent.length < MAX_FAILURES;
}

export function recordLoginFailure(client: string, now = Date.now()): void {
  const recent = (failures.get(client) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  failures.set(client, recent);
}

export function clearLoginFailures(client: string): void {
  failures.delete(client);
}
