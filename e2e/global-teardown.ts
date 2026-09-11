// After a run: the test installation's coordinator session keeps an event
// subscription that would deliver every worker outcome in the environment
// to it (subscriptions select by agent, not by installation). Delete it so
// nothing is delivered between runs; the next run creates a new one.
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./env";

export default async function teardown(): Promise<void> {
  if (process.env.BASE_URL) return;
  loadEnv();
  const path = new URL("../.openmuse-e2e/state.json", import.meta.url);
  let state: { coordinator?: { subscriptionId?: string } };
  try {
    state = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  const subscriptionId = state.coordinator?.subscriptionId;
  if (!subscriptionId) return;
  const apiKey = process.env.OPENCOMPUTER_API_KEY;
  const projectId = process.env.OPENCOMPUTER_PROJECT_ID;
  const apiUrl = new URL(process.env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev").origin;
  if (!apiKey || !projectId) return;
  const response = await fetch(
    `${apiUrl}/api/managed-agents/projects/${encodeURIComponent(projectId)}/event-subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "DELETE", headers: { "x-api-key": apiKey } },
  );
  if (response.status !== 204 && response.status !== 404) {
    console.warn(`Could not delete the test installation's subscription ${subscriptionId}: ${response.status}`);
    return;
  }
  const { subscriptionId: _removed, ...coordinator } = state.coordinator ?? {};
  writeFileSync(path, `${JSON.stringify({ ...state, coordinator }, null, 2)}\n`);
}
