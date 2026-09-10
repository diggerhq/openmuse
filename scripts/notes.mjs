// Fixture note files: a small front matter (title, summary) and the text.
export function parseNote(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { title: "Untitled", summary: "", text: source.trim() };
  const meta = Object.fromEntries(
    match[1].split("\n").filter(Boolean).map((line) => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  return { title: meta.title ?? "Untitled", summary: meta.summary ?? "", text: match[2].trim() };
}
