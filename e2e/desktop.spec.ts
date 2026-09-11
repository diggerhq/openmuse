// The interface, exercised against the real OpenComputer Development
// environment at 1440x900 as its own installation (playwright.config.ts).
// Model spend is a handful of short coordinator turns and one worker turn
// that uses the computer.
import type { Page } from "@playwright/test";
import { expect, screenshot, test } from "./fixtures";

const TOPIC = "workshop-demo";

test.describe.configure({ mode: "serial" });

/** The conversation is attached and accepts input. */
async function ready(page: Page): Promise<void> {
  await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled({ timeout: 30_000 });
}

test("sidebar selection changes the URL and back/forward work", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Main conversation" })).toBeVisible();
  const sidebar = page
    .getByRole("complementary", { name: "Conversations" })
    .or(page.locator('[data-slot="sidebar"]').first());
  await sidebar.getByRole("link", { name: /Workshop demo/ }).click();
  await expect(page).toHaveURL(/\/topics\/workshop-demo$/);
  await expect(page.getByRole("heading", { name: "Workshop demo" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Main conversation" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/topics\/workshop-demo$/);
});

test("the main conversation replays history and streams a short reply", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  await ready(page);
  await screenshot(page, "01-main-conversation");
  const composer = page.getByRole("textbox", { name: "Message" });
  const word = `pong-${Date.now().toString(36).slice(-4)}`;
  await composer.fill(`Reply with exactly this word and nothing else: ${word}`);
  await composer.press("Enter");
  // The owner's message appears at once, then the reply streams in.
  await expect(page.getByText(`Reply with exactly this word and nothing else: ${word}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop the current reply" })).toBeVisible({ timeout: 30_000 });
  await screenshot(page, "07-main-streaming");
  await expect(page.locator(".prose-chat", { hasText: word }).last()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 30_000 });
});

test("the Stop control interrupts a running reply", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill(
    "Count from 1 to 80, one number per line, and after each number write one full sentence about it.",
  );
  await composer.press("Enter");
  const stop = page.getByRole("button", { name: "Stop the current reply" });
  await expect(stop).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500);
  await stop.click();
  await expect(page.getByRole("button", { name: "Stop the current reply" })).toContainText("Stopping", {
    timeout: 5_000,
  });
  await expect(
    page
      .getByText("You pressed Stop")
      .or(page.getByText(/^Stopped/))
      .first(),
  ).toBeVisible({ timeout: 120_000 });
  await screenshot(page, "08-main-stop");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 120_000 });
});

test("a task sent from the topic starts a worker that uses its computer", async ({ page, owner }) => {
  void owner;
  await page.goto(`/topics/${TOPIC}`);
  await expect(page.getByRole("heading", { name: "Workshop demo" })).toBeVisible();
  await ready(page);
  const composer = page.getByRole("textbox", { name: "Message" });
  await composer.fill(
    "Run `node --version` on your computer and reply with the one line of output as evidence. Do not save notes for this.",
  );
  await composer.press("Enter");
  await expect(page.getByText("Worker").first()).toBeVisible({ timeout: 60_000 });
  // The sandbox starts on the first command; the reply follows it.
  await expect(page.getByRole("button", { name: /Did \d+ steps?/ }).first()).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible({ timeout: 180_000 });
  await expect(page.locator(".prose-chat", { hasText: /v\d+\.\d+\.\d+/ }).last()).toBeVisible();
});

test("a topic shows its conversation with tool activity, its notes and its work", async ({ page, owner }) => {
  void owner;
  await page.goto(`/topics/${TOPIC}`);
  await expect(page.getByRole("heading", { name: "Workshop demo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What the assistant knows about this topic" })).toHaveValue(
    /Repository/,
    { timeout: 15_000 },
  );
  await expect(page.getByText("Worker").first()).toBeVisible({ timeout: 30_000 });
  await screenshot(page, "02-topic-workshop-demo");
  await page
    .getByRole("button", { name: "Show earlier messages" })
    .click({ timeout: 5_000 })
    .catch(() => undefined);
  const steps = page.getByRole("button", { name: /Did \d+ steps?/ }).first();
  await expect(steps).toBeVisible({ timeout: 15_000 });
  await steps.scrollIntoViewIfNeeded();
  await steps.click();
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { expanded: false }) })
    .first();
  await row.getByRole("button").first().click();
  await screenshot(page, "03-topic-tool-activity");
  await expect(page.getByRole("link", { name: /Open in OpenComputer/ })).toHaveAttribute("href", /\/sessions\//);
});

test("editing a note and saving shows saved only after the server confirmed", async ({ page, owner }) => {
  const before = await (await owner.api(`/api/topics/${TOPIC}`)).json();
  await page.goto(`/topics/${TOPIC}`);
  const notes = page.getByRole("textbox", { name: "What the assistant knows about this topic" });
  await expect(notes).toHaveValue(/Repository/, { timeout: 15_000 });
  await notes.click();
  await notes.press("End");
  await notes.press("Control+End");
  const marker = `\nOwner note from the UI test ${Date.now()}`;
  await notes.pressSequentially(marker.slice(0, 12));
  await notes.type(marker.slice(12));
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await screenshot(page, "04-notes-unsaved");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText(/^Saved just now/)).toBeVisible({ timeout: 15_000 });
  await screenshot(page, "05-notes-saved");
  const after = await (await owner.api(`/api/topics/${TOPIC}`)).json();
  expect(after.document.revision).not.toBe(before.document.revision);
  expect(after.document.writer.kind).toBe("owner");
  // Put the original text back.
  const restore = await owner.api(`/api/topics/${TOPIC}/notes`, {
    method: "PUT",
    body: { text: before.document.text, summary: before.document.summary, revision: after.document.revision },
  });
  expect(restore.status()).toBe(200);
});

test("a save that lost the race shows the server's text instead of overwriting it", async ({ page, owner }) => {
  const original = await (await owner.api(`/api/topics/${TOPIC}`)).json();
  await page.goto(`/topics/${TOPIC}`);
  const notes = page.getByRole("textbox", { name: "What the assistant knows about this topic" });
  await expect(notes).toHaveValue(/Repository/, { timeout: 15_000 });
  await notes.click();
  await notes.press("Control+End");
  await notes.type("\nMy unsaved line");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  // Someone else (the API, standing in for the assistant) saves first.
  const theirs = `${original.document.text}\nSaved by someone else at ${new Date().toISOString()}`;
  const race = await owner.api(`/api/topics/${TOPIC}/notes`, {
    method: "PUT",
    body: { text: theirs, summary: original.document.summary, revision: original.document.revision },
  });
  expect(race.status()).toBe(200);
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByRole("alert")).toContainText("Someone else saved first", { timeout: 15_000 });
  await expect(page.getByRole("alert")).toContainText("Saved by someone else at");
  await expect(notes).toHaveValue(/My unsaved line/);
  await screenshot(page, "06-notes-conflict");
  await page.getByRole("button", { name: "Use their text" }).click();
  await expect(notes).toHaveValue(/Saved by someone else at/);
  await expect(notes).not.toHaveValue(/My unsaved line/);
  // Put the original text back.
  const current = await (await owner.api(`/api/topics/${TOPIC}`)).json();
  const restore = await owner.api(`/api/topics/${TOPIC}/notes`, {
    method: "PUT",
    body: { text: original.document.text, summary: original.document.summary, revision: current.document.revision },
  });
  expect(restore.status()).toBe(200);
});

test("a dropped connection shows a reconnect banner and recovers", async ({ page, context, owner }) => {
  void owner;
  await page.goto("/");
  await ready(page);
  await context.setOffline(true);
  await expect(page.getByText("Connection lost. Trying again…")).toBeVisible({ timeout: 15_000 });
  await screenshot(page, "09-reconnect-banner");
  await context.setOffline(false);
  await expect(page.getByText("Connection lost. Trying again…")).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Connection restored")).toBeVisible({ timeout: 10_000 });
});

test("the command palette jumps between conversations", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  await ready(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.getByPlaceholder("Jump to a conversation…");
  await input.fill("workshop");
  await expect(dialog.getByRole("option", { name: /Workshop demo/ })).toBeVisible();
  await screenshot(page, "10-command-palette");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/topics\/workshop-demo$/);
  await expect(dialog).toBeHidden();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Jump to a conversation…").fill("main");
  await expect(dialog.getByRole("option", { name: /Main conversation/ })).toBeVisible();
  await dialog.getByPlaceholder("Jump to a conversation…").press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the sidebar and the panel collapse and remember it", async ({ page, owner }) => {
  void owner;
  await page.goto(`/topics/${TOPIC}`);
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  const sidebar = page.locator('[data-slot="sidebar"][data-state]').first();
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await screenshot(page, "13-sidebar-collapsed");
  await page.getByRole("button", { name: /Hide notes and work/ }).click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeHidden();
  await screenshot(page, "14-panel-collapsed");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workshop demo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeHidden();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.getByRole("button", { name: /Show notes and work/ }).click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
});

test("dark mode follows the toggle", async ({ page, owner }) => {
  void owner;
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.waitForTimeout(500);
  await screenshot(page, "11-dark-main");
  await page.goto(`/topics/${TOPIC}`);
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("Worker").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await screenshot(page, "12-dark-topic");
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("menuitem", { name: "System" }).click();
});
