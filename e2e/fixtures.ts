// Signs the tests in the way the app itself does: the owner cookie is minted
// with the app's own signing code and OPENMUSE_COOKIE_SECRET from the
// environment (.env.local), never by typing the owner secret into the form.
import { type APIResponse, test as base, type Page } from "@playwright/test";
import { loadEnv } from "./env";

loadEnv();

export async function ownerCookie(): Promise<{ name: string; value: string; csrf: string }> {
  const { issueSession, SESSION_COOKIE } = await import("../src/lib/auth/cookie");
  const { value, session } = await issueSession();
  return { name: SESSION_COOKIE, value, csrf: session.csrf };
}

export interface Owner {
  readonly csrf: string;
  /** A JSON request with the cookie, the CSRF token and the app origin, like the browser sends. */
  api(path: string, init?: { method?: string; body?: unknown }): Promise<APIResponse>;
}

export const test = base.extend<{ owner: Owner }>({
  owner: async ({ context, baseURL, page }, use) => {
    const cookie = await ownerCookie();
    const url = new URL(baseURL ?? "http://localhost:3100");
    await context.addCookies([
      { name: cookie.name, value: cookie.value, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    await use({
      csrf: cookie.csrf,
      api: (path, init = {}) =>
        page.request.fetch(new URL(path, url).toString(), {
          method: init.method ?? "GET",
          headers: { "content-type": "application/json", "x-csrf-token": cookie.csrf, origin: url.origin },
          ...(init.body === undefined ? {} : { data: JSON.stringify(init.body) }),
        }),
    });
  },
});

export { expect } from "@playwright/test";

/**
 * Screenshots land under test-results unless SCREENSHOT_DIR says otherwise;
 * a deliberate refresh of the ones in docs/ui.md sets it to docs/screenshots.
 */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${process.env.SCREENSHOT_DIR ?? "test-results/screenshots"}/${name}.png`,
    fullPage: false,
  });
}
