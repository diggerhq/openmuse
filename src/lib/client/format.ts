// Plain-language time and size formatting for the UI.
export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function duration(startIso: string | undefined, endIso: string | undefined, now = Date.now()): string {
  if (!startIso) return "";
  const start = Date.parse(startIso);
  const end = endIso ? Date.parse(endIso) : now;
  if (Number.isNaN(start) || Number.isNaN(end)) return "";
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

export function clock(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function bytes(value: number): string {
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} kB`;
}

/** The first line of a tool input as a one-line command excerpt. */
export function commandExcerpt(input: string | undefined, max = 96): string {
  if (!input) return "";
  let text = input;
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    const candidate =
      parsed.command ?? parsed.cmd ?? parsed.path ?? parsed.filePath ?? parsed.pattern ?? parsed.query ?? parsed.url;
    if (typeof candidate === "string") text = candidate;
    else if (typeof parsed.task === "string") text = parsed.task;
  } catch {
    /* not JSON */
  }
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
