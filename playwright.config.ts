import { defineConfig, devices } from "@playwright/test";

// End-to-end against the real app and the real OpenComputer Development
// environment: no mock backend. Playwright starts its own server on port
// 3101 as a separate installation (its own installation id and state
// directory, so its coordinator session and worker sessions are not the
// owner's; memory documents are shared per project and environment, and the
// suite restores what it edits). BASE_URL points the suite at another
// server instead. e2e/global-teardown.ts removes the test installation's
// outcome subscription so worker outcomes stop being delivered to it
// between runs.
const port = 3101;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npx vite dev --port ${port}`,
        url: `http://localhost:${port}/api/health`,
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
          OPENMUSE_INSTALLATION_ID: "e2e",
          OPENMUSE_STATE_DIR: ".openmuse-e2e",
          OPENMUSE_ALLOW_INSECURE_COOKIES: "1",
        },
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      // Chromium with a phone viewport: one browser to install, the same layout rules.
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
