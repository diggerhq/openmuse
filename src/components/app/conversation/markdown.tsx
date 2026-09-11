// Agent output as markdown: GFM, code highlighted by shiki once the text has
// stopped streaming, everything wrapped so the page never scrolls sideways.
import { type ReactNode, useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HighlighterCore } from "shiki/core";

const LANGUAGES = new Set([
  "bash",
  "shellscript",
  "sh",
  "typescript",
  "ts",
  "javascript",
  "js",
  "json",
  "python",
  "py",
  "diff",
  "markdown",
  "md",
  "yaml",
  "yml",
  "tsx",
  "jsx",
]);

let highlighter: Promise<HighlighterCore> | undefined;
function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([core, engine]) =>
    core.createHighlighterCore({
      themes: [import("@shikijs/themes/github-light"), import("@shikijs/themes/github-dark")],
      langs: [
        import("@shikijs/langs/bash"),
        import("@shikijs/langs/typescript"),
        import("@shikijs/langs/javascript"),
        import("@shikijs/langs/json"),
        import("@shikijs/langs/python"),
        import("@shikijs/langs/diff"),
        import("@shikijs/langs/markdown"),
        import("@shikijs/langs/yaml"),
        import("@shikijs/langs/tsx"),
        import("@shikijs/langs/jsx"),
      ],
      engine: engine.createJavaScriptRegexEngine(),
    }),
  );
  return highlighter;
}

const ALIAS: Record<string, string> = {
  sh: "bash",
  shellscript: "bash",
  ts: "typescript",
  js: "javascript",
  py: "python",
  md: "markdown",
  yml: "yaml",
};

function CodeBlock({ language, code, live }: { language: string | undefined; code: string; live: boolean }) {
  const [html, setHtml] = useState<string>();
  const lang = language && LANGUAGES.has(language) ? (ALIAS[language] ?? language) : undefined;
  useEffect(() => {
    if (live || !lang) {
      setHtml(undefined);
      return;
    }
    let cancelled = false;
    getHighlighter()
      .then((shiki) => {
        if (cancelled) return;
        setHtml(
          shiki.codeToHtml(code, {
            lang,
            themes: { light: "github-light", dark: "github-dark" },
            defaultColor: false,
          }),
        );
      })
      .catch(() => setHtml(undefined));
    return () => {
      cancelled = true;
    };
  }, [code, lang, live]);
  if (html) {
    // shiki escapes the code it renders; the HTML is its own token markup.
    // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output
    return <div className="[&>pre]:my-0" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <pre>
      <code>{code}</code>
    </pre>
  );
}

function childrenText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childrenText).join("");
  return "";
}

export function Markdown({ text, live = false, className }: { text: string; live?: boolean; className?: string }) {
  const components: Components = {
    pre: ({ children }) => <>{children}</>,
    code: ({ className: codeClass, children, ...rest }) => {
      const match = /language-([\w-]+)/.exec(codeClass ?? "");
      const raw = childrenText(children);
      // A fenced block arrives with a language class or a trailing newline; inline code has neither.
      if (match || raw.includes("\n"))
        return <CodeBlock language={match?.[1]} code={raw.replace(/\n$/, "")} live={live} />;
      return (
        <code className={codeClass} {...rest}>
          {children}
        </code>
      );
    },
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
  };
  return (
    <div className={`prose-chat text-sm leading-relaxed ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
