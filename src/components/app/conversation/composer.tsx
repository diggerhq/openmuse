// The one place to write: Enter sends, Shift+Enter breaks the line, Stop
// replaces Send while a reply is in progress, and a disabled composer says
// why. Cmd/Ctrl+/ focuses it from anywhere.
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type KeyboardEvent, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

export interface ComposerHandle {
  focus(): void;
  insert(text: string): void;
}

export function Composer({
  onSend,
  onStop,
  running,
  disabledReason,
  placeholder,
  ref,
}: {
  onSend: (text: string) => Promise<void>;
  onStop: () => Promise<void>;
  running: boolean;
  disabledReason?: string;
  placeholder: string;
  ref?: Ref<ComposerHandle>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    insert: (value) => {
      setText(value);
      area.current?.focus();
    },
  }));

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        area.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!running) setStopping(false);
  }, [running]);

  const disabled = Boolean(disabledReason);
  const canSend = !disabled && !busy && text.trim().length > 0;

  async function send() {
    if (!canSend) return;
    const value = text.trim();
    setBusy(true);
    setText("");
    try {
      await onSend(value);
    } catch {
      setText(value);
    } finally {
      setBusy(false);
      area.current?.focus();
    }
  }

  async function stop() {
    setStopping(true);
    try {
      await onStop();
    } finally {
      /* the turn's cancelled event clears the running state */
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <div className="shrink-0 border-t bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
        {disabledReason ? (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            {disabledReason}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/40">
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <Textarea
            id="composer"
            ref={area}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="max-h-48 min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void stop()}
              disabled={stopping}
              aria-label="Stop the current reply"
            >
              <SquareIcon className="size-3.5 fill-current" aria-hidden />
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button type="button" size="icon" onClick={() => void send()} disabled={!canSend} aria-label="Send">
              <ArrowUpIcon className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
          <Kbd>Enter</Kbd> sends · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line · <Kbd>⌘</Kbd>+<Kbd>/</Kbd> focus ·{" "}
          <Kbd>⌘</Kbd>+<Kbd>K</Kbd> jump
        </p>
      </div>
    </div>
  );
}
