// Before any test: the server the suite is about to drive must be the test
// installation. The suite sends real turns; driven at the owner's server
// they would land in the owner's conversation. A dev server that lost its
// port to another one (Vite moves to the next free port unless told
// --strictPort) is exactly how that happened once, so the check is on the
// server's own answer, not on the port.
import { E2E_INSTALLATION_ID } from "./env";

export default async function setup(config: { projects: Array<{ use: { baseURL?: string } }> }): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3101";
  const response = await fetch(new URL("/api/health", baseURL));
  const health = (await response.json().catch(() => ({}))) as { installationId?: string };
  if (health.installationId !== E2E_INSTALLATION_ID) {
    throw new Error(
      `${baseURL} reports installation ${JSON.stringify(health.installationId ?? null)}, not ${JSON.stringify(E2E_INSTALLATION_ID)}; the suite only runs against its own installation (see playwright.config.ts)`,
    );
  }
}
