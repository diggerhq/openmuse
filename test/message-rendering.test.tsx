// @vitest-environment happy-dom
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { Markdown } from "@/components/app/conversation/markdown";
import { AssistantMessage, IncomingMessage } from "@/components/app/conversation/message";
import { ToolActivity } from "@/components/app/conversation/tool-activity";
import type { ToolCall } from "@/lib/events/messages";
import { outcomeMessage } from "@/lib/return-path";

function renderWithRouter(ui: ReactNode) {
  const root = createRootRoute({ component: () => ui });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) });
  return render(<RouterProvider router={router} />);
}

test("markdown renders GFM with wrapped code blocks and inline code", async () => {
  render(
    <Markdown text={"# Title\n\nSome `inline` text\n\n```bash\nnpm ci\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |"} />,
  );
  expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
  expect(screen.getByText("inline").tagName).toBe("CODE");
  expect(screen.getByText("npm ci").closest("pre")).toBeTruthy();
  expect(screen.getByRole("table")).toBeTruthy();
});

test("tool activity shows compact rows with command, duration and result excerpt", () => {
  const calls: ToolCall[] = [
    {
      id: "1",
      name: "shell",
      input: JSON.stringify({ command: "npm test" }),
      output: "12 passing",
      status: "completed",
      startedAt: "2026-09-10T10:00:00.000Z",
      endedAt: "2026-09-10T10:00:02.000Z",
    },
    {
      id: "2",
      name: "shell",
      input: JSON.stringify({ command: "npm run build" }),
      output: "error TS2322",
      status: "failed",
      startedAt: "2026-09-10T10:00:03.000Z",
      endedAt: "2026-09-10T10:00:04.500Z",
    },
  ];
  render(<ToolActivity calls={calls} running={false} now={Date.parse("2026-09-10T10:00:10.000Z")} />);
  const summary = screen.getByRole("button", { name: /Did 2 steps/ });
  expect(summary.textContent).toContain("1 failed");
  fireEvent.click(summary);
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(within(rows[0] as HTMLElement).getByText("npm test")).toBeTruthy();
  expect(within(rows[0] as HTMLElement).getByText("2 s")).toBeTruthy();
  const first = within(rows[0] as HTMLElement).getByRole("button");
  fireEvent.click(first);
  expect(within(rows[0] as HTMLElement).getByText("12 passing")).toBeTruthy();
});

test("a failed turn shows its reason inside the assistant message", () => {
  render(
    <AssistantMessage
      text="Partial answer"
      streaming={false}
      tools={[]}
      turn={{ turnId: "t", status: "failed", detail: "model unavailable" }}
      now={0}
      who="Worker"
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("model unavailable");
});

test("outcome messages in the main conversation are cards that deep-link to the topic", async () => {
  const text = outcomeMessage({
    topicId: "workshop-demo",
    title: "Workshop demo",
    workerSessionId: "s",
    workerTurnId: "t",
    status: "completed",
    text: "All commands verified.",
  });
  renderWithRouter(<IncomingMessage message={{ id: "m", role: "user", text }} />);
  const link = await screen.findByRole("link", { name: /Open topic/ });
  expect(link.getAttribute("href")).toBe("/topics/workshop-demo");
  expect(screen.getByText("Workshop demo")).toBeTruthy();
  expect(screen.getByText("finished a task")).toBeTruthy();
  expect(screen.getByText("All commands verified.")).toBeTruthy();
});

test("a stop request and a plain owner message render as what they are", async () => {
  renderWithRouter(
    <>
      <IncomingMessage message={{ id: "a", role: "user", text: "[stop] The owner pressed Stop." }} />
      <IncomingMessage message={{ id: "b", role: "user", text: "hello" }} />
    </>,
  );
  expect(await screen.findByText("You pressed Stop")).toBeTruthy();
  expect(screen.getByText("hello")).toBeTruthy();
});
