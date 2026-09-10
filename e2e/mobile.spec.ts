// Narrow viewport (390x844): the sidebar is a sheet, the panel is a sheet.
import { expect, screenshot, test } from "./fixtures";

test("the sidebar and the panel become sheets on a phone", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Main conversation" })).toBeVisible();
  await expect(page.getByText("OpenMuse").first()).toBeVisible({ timeout: 30_000 });
  await screenshot(page, "m01-mobile-main");
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Workshop demo/ })).toBeVisible();
  await screenshot(page, "m02-mobile-sidebar-sheet");
  await sheet.getByRole("link", { name: /Workshop demo/ }).click();
  await expect(page).toHaveURL(/\/topics\/workshop-demo$/);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { name: "Workshop demo" })).toBeVisible();
  await expect(page.getByText("Worker").first()).toBeVisible({ timeout: 30_000 });
  await screenshot(page, "m03-mobile-topic");
  await page.getByRole("button", { name: /Show notes and work/ }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Notes", exact: true })).toBeVisible();
  await screenshot(page, "m04-mobile-panel-sheet");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
