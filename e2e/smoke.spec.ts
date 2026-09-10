import { expect, test } from "./fixtures";

test("unauthenticated visitors land on the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "OpenMuse" })).toBeVisible();
});

test("the owner cookie opens the main conversation", async ({ page, owner }) => {
  const me = await owner.api("/api/auth/me");
  expect(me.status()).toBe(200);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Main conversation" })).toBeVisible();
});
