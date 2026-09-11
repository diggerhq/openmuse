// One live conversation: @opencomputer/react attaches to the session through
// the app's proxy; this hook adds the tool activity per turn, whether the
// event polling is reachable, and a clock for elapsed times.
import { type AgentEvent, type MemorySave, type UseAgentResult, useAgent } from "@opencomputer/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client/api";
import { type Activity, applyActivity, emptyActivity, type TurnState } from "@/lib/events/messages";

export interface Conversation {
  readonly agent: UseAgentResult;
  readonly activity: Activity;
  /** False while event polling fails (network down, server unreachable). */
  readonly online: boolean;
  readonly currentTurn: TurnState | undefined;
  readonly now: number;
}

export function useNow(fast: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), fast ? 1000 : 30_000);
    return () => clearInterval(timer);
  }, [fast]);
  return now;
}

export function useConversation({
  csrf,
  sessionId,
  onMemorySaved,
  onTurnSettled,
}: {
  csrf: string;
  sessionId: string | undefined;
  onMemorySaved?: (save: MemorySave) => void;
  onTurnSettled?: () => void;
}): Conversation {
  const [activity, setActivity] = useState<Activity>(emptyActivity);
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);

  const fetchWithCsrf = useMemo(() => {
    const inner = apiFetch(csrf);
    let lastSuccess = 0;
    let sequence = 0;
    const mark = (value: boolean) => {
      if (onlineRef.current === value) return;
      onlineRef.current = value;
      setOnline(value);
      if (value) toast.success("Connection restored", { id: "connection" });
    };
    const tracked: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const polling = url.includes("/events");
      sequence += 1;
      const started = sequence;
      try {
        const response = await inner(input, init);
        if (polling) {
          if (response.status < 500) {
            lastSuccess = started;
            mark(true);
          } else if (started > lastSuccess) mark(false);
        }
        return response;
      } catch (error) {
        // A request that started before the last success is stale news, and
        // one the hook itself cancelled says nothing about the connection.
        const aborted = init?.signal?.aborted || (error instanceof Error && error.name === "AbortError");
        if (polling && !aborted && started > lastSuccess) mark(false);
        throw error;
      }
    };
    return tracked;
  }, [csrf]);

  const settled = useRef(onTurnSettled);
  settled.current = onTurnSettled;
  const saved = useRef(onMemorySaved);
  saved.current = onMemorySaved;

  const agent = useAgent({
    // An empty id attaches to nothing: the hook stays idle until a session exists.
    sessionId: sessionId ?? "",
    basePath: "/api",
    fetch: fetchWithCsrf,
    onEvent: (event: AgentEvent) => setActivity((current) => applyActivity(current, event)),
    onMemorySaved: (save) => saved.current?.(save),
  });

  // A finished turn may have changed notes or the topic list.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !agent.isRunning) settled.current?.();
    wasRunning.current = agent.isRunning;
  }, [agent.isRunning]);

  // The hook reports failures in one place; the ones that are not the
  // connection (those show as a banner) surface as a toast.
  const lastError = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (agent.error && agent.error !== lastError.current && onlineRef.current) toast.error(agent.error);
    lastError.current = agent.error;
  }, [agent.error]);

  const currentTurn = useMemo(
    () => Object.values(activity.turns).find((turn) => turn.status === "running"),
    [activity.turns],
  );
  const now = useNow(Boolean(currentTurn) || agent.isRunning);
  return { agent, activity, online, currentTurn, now };
}
