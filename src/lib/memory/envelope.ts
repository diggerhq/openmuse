// The recall block format shared by the server (compose), the browser
// (strip for display) and the agent-side adapters (parse). Pure; no I/O.
export const RECALL_OPEN = "<openmuse-recall>";
export const RECALL_CLOSE = "</openmuse-recall>";

export function composeInput(recall: unknown, text: string): string {
  return `${RECALL_OPEN}\n${JSON.stringify(recall)}\n${RECALL_CLOSE}\n\n${text}`;
}

/** The owner-visible part of a turn input. */
export function stripRecall(input: string): string {
  if (!input.startsWith(RECALL_OPEN)) return input;
  const end = input.indexOf(RECALL_CLOSE);
  if (end === -1) return input;
  return input.slice(end + RECALL_CLOSE.length).replace(/^\s+/, "");
}
