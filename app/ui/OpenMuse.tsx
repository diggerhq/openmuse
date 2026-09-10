"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyEvent, emptyTimeline, type Activity, type Timeline } from "@/lib/events/messages";
import type { OcEvent } from "@/lib/oc/client";
import type { TopicDetail, TopicSummary } from "@/lib/topics/service";

interface Props {
  csrf: string;
  memoryBackend: "fixture" | "platform";
}

async function api<T>(csrf: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-csrf-token": csrf, ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/login");
    throw Object.assign(new Error(body.error ?? `Request failed (${response.status})`), { status: response.status, body });
  }
  return body;
}

// Keeps a timeline in sync with a session through the app's SSE route.
function useLiveTimeline(url: string | null, initial: Timeline | null) {
  const [timeline, setTimeline] = useState<Timeline>(initial ?? emptyTimeline());
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setTimeline(initial ?? emptyTimeline());
  }, [initial]);
  useEffect(() => {
    if (!url || !initial) return;
    const source = new EventSource(`${url}?after=${initial.cursor}`);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("event", (message) => {
      const event = JSON.parse((message as MessageEvent).data) as OcEvent;
      setTimeline((current) => (event.seq <= current.cursor ? current : applyEvent(current, event)));
    });
    source.onerror = () => setConnected(false);
    return () => { source.close(); setConnected(false); };
  }, [url, initial]);
  return { timeline, connected };
}

function ActivityList({ items, running }: { items: Activity[]; running: boolean }) {
  const shown = items.slice(-40);
  if (shown.length === 0) return null;
  return (
    <div className="activity">
      {shown.map((item) => (
        item.detail ? (
          <details key={item.id}>
            <summary>{item.kind.replace("tool.", "")} {item.label}{item.at ? ` · ${item.at.slice(11, 19)}` : ""}</summary>
            <pre>{item.detail}</pre>
          </details>
        ) : (
          <div key={item.id}>{item.label}{item.at ? ` · ${item.at.slice(11, 19)}` : ""}</div>
        )
      ))}
      {running ? <div>working…</div> : null}
    </div>
  );
}

function Messages({ timeline }: { timeline: Timeline }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [timeline]);
  return (
    <div className="messages">
      {timeline.messages.map((message) => (
        <div key={message.id} className={`msg ${message.role}${message.streaming ? " streaming" : ""}`}>
          <div className="who">{message.role === "owner" ? "you" : message.role === "app" ? "topic outcome" : "OpenMuse"}</div>
          {message.text}
        </div>
      ))}
      <ActivityList items={timeline.activity} running={timeline.running} />
      <div ref={end} />
    </div>
  );
}

function Conversation({ csrf }: { csrf: string }) {
  const [sessionId, setSessionId] = useState<string>();
  const [initial, setInitial] = useState<Timeline | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { timeline, connected } = useLiveTimeline(sessionId ? "/api/conversation/stream" : null, initial);

  const load = useCallback(async () => {
    try {
      const result = await api<{ sessionId: string; timeline: Timeline }>(csrf, "/api/conversation");
      setSessionId(result.sessionId);
      setInitial(result.timeline);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [csrf]);
  useEffect(() => { void load(); }, [load]);

  async function send() {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(csrf, "/api/conversation/turns", { method: "POST", body: JSON.stringify({ text: value, idempotencyKey: crypto.randomUUID() }) });
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try { await api(csrf, "/api/conversation/stop", { method: "POST" }); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }

  // Upgrade or recovery: a new coordinator session on the current deployment.
  async function replace() {
    if (!confirm("End the coordinator session and start a new one on the current deployment? The conversation starts again from the current notes.")) return;
    setBusy(true);
    try { await api(csrf, "/api/conversation/replace", { method: "POST" }); setInitial(null); setSessionId(undefined); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  }

  return (
    <section className="pane">
      <header>
        <h1>OpenMuse</h1>
        <span className="meta">{sessionId ? `session ${sessionId.slice(0, 8)} · ${connected ? "live" : "reconnecting"}` : "starting…"} <button onClick={() => void replace()} disabled={busy || !sessionId} title="End this coordinator session and start a new one on the current deployment">Replace</button></span>
      </header>
      <div className="scroll">
        {error ? <p className="notice" role="alert">{error} <button onClick={() => void load()}>retry</button></p> : null}
        {initial ? <Messages timeline={timeline} /> : <p className="hint">Attaching to the coordinator session…</p>}
      </div>
      <div className="composer">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask, or hand over work. Enter sends; Shift+Enter for a new line."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        {timeline.running ? <button className="danger" onClick={() => void stop()} disabled={busy}>Stop</button> : null}
        <button className="primary" onClick={() => void send()} disabled={busy || !text.trim() || !sessionId}>Send</button>
      </div>
    </section>
  );
}

function NotesEditor({ csrf, detail, onSaved }: { csrf: string; detail: TopicDetail; onSaved: () => void }) {
  const [text, setText] = useState(detail.document.text);
  const [summary, setSummary] = useState(detail.document.summary);
  const [revision, setRevision] = useState(detail.document.revision);
  const [status, setStatus] = useState<string>();
  const [conflict, setConflict] = useState<{ text: string; summary: string; revision: string }>();
  useEffect(() => {
    setText(detail.document.text);
    setSummary(detail.document.summary);
    setRevision(detail.document.revision);
    setConflict(undefined);
    setStatus(undefined);
  }, [detail.document.revision, detail.document.text, detail.document.summary]);

  async function save() {
    setStatus("saving…");
    try {
      const result = await api<{ status: string; revision?: string }>(csrf, `/api/topics/${encodeURIComponent(detail.topic.id)}/notes`, {
        method: "PUT", body: JSON.stringify({ text, summary, revision }),
      });
      setStatus(`saved (revision ${result.revision?.slice(0, 8)})`);
      onSaved();
    } catch (cause) {
      const body = (cause as { body?: { status?: string; text?: string; summary?: string; revision?: string; reason?: string } }).body;
      if (body?.status === "conflict" && body.text !== undefined) {
        setConflict({ text: body.text, summary: body.summary ?? "", revision: body.revision ?? "" });
        setStatus("someone else saved first; reconcile below");
      } else {
        setStatus(`not saved: ${body?.reason ?? (cause instanceof Error ? cause.message : String(cause))}`);
      }
    }
  }

  return (
    <div className="section">
      <h3>Notes <span className="badge">rev {detail.document.revision.slice(0, 8)}</span><span className="badge">{detail.document.writer.kind === "agent" ? "saved by worker" : "saved by owner"}</span><span className="badge">{detail.document.bytes}/{detail.document.maxBytes} B</span></h3>
      <input type="text" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" />
      <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button className="primary" onClick={() => void save()} disabled={text === detail.document.text && summary === detail.document.summary}>Save notes</button>
        {status ? <span className="hint">{status}</span> : null}
      </div>
      {conflict ? (
        <div className="section">
          <h3>Current text on the server</h3>
          <pre className="msg">{conflict.text}</pre>
          <button onClick={() => { setText(conflict.text); setSummary(conflict.summary); setRevision(conflict.revision); setConflict(undefined); setStatus("loaded the current text; edit and save again"); }}>Take current text</button>
          <button onClick={() => { setRevision(conflict.revision); setConflict(undefined); setStatus("keeping my text over the current revision; save again"); }}>Keep mine</button>
        </div>
      ) : null}
    </div>
  );
}

function TopicPanel({ csrf, topicId, onChanged }: { csrf: string; topicId: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<TopicDetail | null>(null);
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const { timeline, connected } = useLiveTimeline(detail?.session ? `/api/topics/${encodeURIComponent(topicId)}/stream` : null, detail?.timeline ?? null);

  const load = useCallback(async () => {
    try {
      setDetail(await api<TopicDetail>(csrf, `/api/topics/${encodeURIComponent(topicId)}`));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [csrf, topicId]);
  useEffect(() => { setDetail(null); void load(); }, [load]);

  // Refresh the document when work finishes: a save is visible from the API, not only from events.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !timeline.running) { void load(); onChanged(); }
    wasRunning.current = timeline.running;
  }, [timeline.running, load, onChanged]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError(undefined);
    try {
      await api(csrf, `/api/topics/${encodeURIComponent(topicId)}/${path}`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      await load();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <div className="scroll">{error ? <p className="notice">{error}</p> : <p className="hint">Loading topic…</p>}</div>;
  const work = detail.topic.work;
  return (
    <div className="scroll">
      <h2 style={{ margin: 0 }}>{detail.topic.title} {detail.topic.archived ? <span className="badge archived">archived</span> : null}</h2>
      <div className="hint">
        topic {detail.topic.id}
        {detail.session ? ` · worker session ${detail.session.id.slice(0, 8)} (${detail.session.status}${detail.session.microvmState ? `, vm ${detail.session.microvmState}` : ""}) · ${connected ? "live" : "not streaming"}` : " · no worker session yet"}
        {detail.previousWorkerSessionIds.length ? ` · ${detail.previousWorkerSessionIds.length} earlier session(s)` : ""}
      </div>
      {error ? <p className="notice">{error}</p> : null}
      <NotesEditor csrf={csrf} detail={detail} onSaved={() => { void load(); onChanged(); }} />
      <div className="section">
        <h3>Work {work ? <span className={`badge${timeline.running ? " running" : ""}`}>{timeline.running ? "running" : work.lastTurnStatus ?? work.status} · {work.turns} turn(s)</span> : null}</h3>
        {detail.session ? <Messages timeline={timeline} /> : <p className="hint">Work appears here once the coordinator or you start a task.</p>}
      </div>
      <div className="section">
        <h3>Continue this topic</h3>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Another task for this topic's worker" disabled={detail.topic.archived} />
        <div className="row">
          <button className="primary" disabled={busy || !text.trim() || detail.topic.archived} onClick={() => { void act("turns", { text: text.trim() }).then(() => setText("")); }}>Queue task</button>
          {timeline.running ? <button className="danger" disabled={busy} onClick={() => void act("stop")}>Stop</button> : null}
          <button disabled={busy} onClick={() => void act("archive", { archived: !detail.topic.archived, revision: detail.document.revision })}>{detail.topic.archived ? "Unarchive" : "Archive"}</button>
          {detail.session && !detail.topic.archived ? <button disabled={busy} onClick={() => { if (confirm("End this worker session? The next task starts a fresh session from the same notes.")) void act("replace-worker"); }}>Replace worker</button> : null}
        </div>
      </div>
    </div>
  );
}

export default function OpenMuse({ csrf, memoryBackend }: Props) {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();

  const loadTopics = useCallback(async () => {
    try {
      const result = await api<{ topics: TopicSummary[] }>(csrf, "/api/topics");
      setTopics(result.topics);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [csrf]);
  useEffect(() => {
    void loadTopics();
    const timer = setInterval(() => void loadTopics(), 5000);
    return () => clearInterval(timer);
  }, [loadTopics]);

  async function logout() {
    await api(csrf, "/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <main className="app">
      <Conversation csrf={csrf} />
      <section className="pane">
        <header>
          <h2>Topics</h2>
          <span className="meta">memory: {memoryBackend} <button onClick={() => void logout()}>Sign out</button></span>
        </header>
        {selected ? (
          <>
            <div style={{ padding: "8px 16px 0" }}><button onClick={() => setSelected(undefined)}>← all topics</button></div>
            <TopicPanel csrf={csrf} topicId={selected} onChanged={loadTopics} />
          </>
        ) : (
          <div className="scroll">
            {error ? <p className="notice">{error}</p> : null}
            {topics.length === 0 ? <p className="hint">No topics yet. Ask for something that needs a computer and the coordinator will open one.</p> : null}
            <ul className="topics">
              {topics.map((topic) => (
                <li key={topic.id} onClick={() => setSelected(topic.id)}>
                  <div className="t">
                    {topic.title}
                    {topic.work?.activeTurnId ? <span className="badge running">working</span> : topic.work ? <span className="badge">{topic.work.lastTurnStatus}</span> : null}
                    {topic.archived ? <span className="badge archived">archived</span> : null}
                  </div>
                  <div className="s">{topic.summary || "no summary yet"} · {topic.updatedAt.slice(0, 16).replace("T", " ")}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
