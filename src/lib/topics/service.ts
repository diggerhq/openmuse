// Topics: a topic is a memory document (topics/<id>) plus one ongoing worker
// session. Topic creation, session creation and first-turn admission are
// separate idempotent operations with different keys, so a retry converges
// without duplicate work.
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { type Document, memory, type SaveResult } from "@/lib/memory";
import { composeTurnInput, recallForWorker } from "@/lib/memory/recall";
import { type OcSession, oc } from "@/lib/oc/client";
import {
  activeDeploymentId,
  activeTurn,
  createOrReuseSession,
  interruptSession,
  queueTurn,
  readSession,
  sessionUsable,
} from "@/lib/oc/sessions";
import { readState, type TopicRecord, updateState } from "@/lib/state/store";

export type StartTopicResult =
  | {
      readonly status: "started";
      readonly topicId: string;
      readonly title: string;
      readonly sessionId: string;
      readonly turnId: string;
      readonly duplicate: boolean;
      readonly newTopic: boolean;
    }
  | {
      readonly status: "refused";
      readonly reason: "archived" | "not_found";
      readonly topicId: string;
      readonly topics?: string[];
    };

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "topic"
  );
}

async function topicIdFor(title: string, invocationId: string): Promise<string> {
  return `${slug(title)}-${(await sha256Hex(invocationId)).slice(0, 6)}`;
}

async function ensureTopicRecord(topicId: string, title: string): Promise<TopicRecord> {
  return updateState((state) => {
    const existing = state.topics[topicId];
    if (existing) return { state, result: existing };
    const record: TopicRecord = {
      id: topicId,
      title,
      createdAt: new Date().toISOString(),
      archived: false,
      previousWorkerSessionIds: [],
      invocations: {},
      recalledRevision: {},
    };
    return { state: { ...state, topics: { ...state.topics, [topicId]: record } }, result: record };
  });
}

// One ongoing worker session per topic, keyed by installation/topic/deployment
// (and the predecessor when replacing), so same-release callers converge.
async function ensureWorkerSession(topic: TopicRecord): Promise<string> {
  if (topic.workerSessionId && sessionUsable(await readSession(topic.workerSessionId))) return topic.workerSessionId;
  const deploymentId = await activeDeploymentId(env().workerAgent);
  const predecessor = topic.workerSessionId ?? topic.previousWorkerSessionIds.at(-1);
  const key = `topic/${topic.id}/${deploymentId}${predecessor ? `/after/${predecessor}` : ""}`;
  const created = await createOrReuseSession(env().workerAgent, key);
  await updateState((state) => {
    const current = state.topics[topic.id];
    if (!current || current.workerSessionId === created.id) return { state, result: undefined };
    const previous = current.workerSessionId
      ? [...current.previousWorkerSessionIds, current.workerSessionId]
      : current.previousWorkerSessionIds;
    return {
      state: {
        ...state,
        topics: {
          ...state.topics,
          [topic.id]: {
            ...current,
            workerSessionId: created.id,
            workerDeploymentId: deploymentId,
            previousWorkerSessionIds: previous,
          },
        },
      },
      result: undefined,
    };
  });
  return created.id;
}

async function queueWorkerTurn(topicId: string, sessionId: string, text: string, idempotencyKey: string) {
  const recall = await recallForWorker(topicId);
  // The revision this session is about to see is the expected revision of its next save.
  if (recall.topic) {
    const revision = recall.topic.revision;
    await updateState((state) => {
      const current = state.topics[topicId];
      if (!current) return { state, result: undefined };
      return {
        state: {
          ...state,
          topics: {
            ...state.topics,
            [topicId]: { ...current, recalledRevision: { ...current.recalledRevision, [sessionId]: revision } },
          },
        },
        result: undefined,
      };
    });
  }
  return queueTurn(sessionId, composeTurnInput(recall, text), idempotencyKey);
}

export async function startTopic(input: {
  topicId?: string;
  title?: string;
  task: string;
  invocationId: string;
}): Promise<StartTopicResult> {
  const state = await readState();
  let topicId = input.topicId;
  let title = input.title ?? "";
  let newTopic = false;
  if (!topicId) {
    topicId = await topicIdFor(title, input.invocationId);
    const created = await memory().create("topics", topicId, { title, text: "", summary: "" });
    newTopic = created.status === "created";
    if (created.status === "deleted") return { status: "refused", reason: "not_found", topicId };
  }
  const document = await memory().get("topics", topicId);
  if (!document) {
    return { status: "refused", reason: "not_found", topicId, topics: Object.keys(state.topics) };
  }
  title = document.title;
  const record = await ensureTopicRecord(topicId, title);
  // The document policy is the authority on archive state, not a summary.
  if (document.agentWrites === "disabled" || record.archived) return { status: "refused", reason: "archived", topicId };
  const sessionId = await ensureWorkerSession(record);
  const turnKey = `invocation/${input.invocationId}`;
  const turn = await queueWorkerTurn(topicId, sessionId, input.task, turnKey);
  await updateState((current) => {
    const topic = current.topics[topicId];
    if (!topic) return { state: current, result: undefined };
    return {
      state: {
        ...current,
        topics: {
          ...current.topics,
          [topicId]: { ...topic, invocations: { ...topic.invocations, [input.invocationId]: turn.turnId } },
        },
      },
      result: undefined,
    };
  });
  return { status: "started", topicId, title, sessionId, turnId: turn.turnId, duplicate: turn.duplicate, newTopic };
}

// Owner follow-up from the topic's conversation: another turn on the same session.
export async function continueTopic(topicId: string, text: string, idempotencyKey: string = crypto.randomUUID()) {
  const document = await memory().get("topics", topicId);
  if (!document) throw new Error("not_found");
  const record = await ensureTopicRecord(topicId, document.title);
  if (record.archived || document.agentWrites === "disabled") throw new Error("archived");
  const sessionId = await ensureWorkerSession(record);
  return { sessionId, ...(await queueWorkerTurn(topicId, sessionId, text, idempotencyKey)) };
}

export const STOP_WORKER =
  "[stop] The owner pressed Stop. Stop the current work; reply in one short sentence with where things stand and save notes if you have verified anything.";

export async function stopTopic(topicId: string) {
  const record = (await readState()).topics[topicId];
  if (!record?.workerSessionId) throw new Error("not_found");
  return interruptSession(record.workerSessionId, STOP_WORKER);
}

// Which conversation a session id belongs to, for the browser's session
// proxy: the coordinator, a topic's current worker, or one of its earlier
// workers (readable history, no new turns).
export type SessionRole =
  | { readonly kind: "coordinator" }
  | { readonly kind: "worker"; readonly topicId: string; readonly current: boolean };

export async function sessionRole(sessionId: string): Promise<SessionRole | null> {
  const state = await readState();
  if (state.coordinator?.sessionId === sessionId) return { kind: "coordinator" };
  for (const topic of Object.values(state.topics)) {
    if (topic.workerSessionId === sessionId) return { kind: "worker", topicId: topic.id, current: true };
    if (topic.previousWorkerSessionIds.includes(sessionId))
      return { kind: "worker", topicId: topic.id, current: false };
  }
  if (state.previousCoordinatorSessionIds?.includes(sessionId)) return { kind: "coordinator" };
  return null;
}

export interface TopicSummary {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly archived: boolean;
  readonly agentWrites: "enabled" | "disabled";
  readonly workerSessionId?: string;
  readonly work?: {
    readonly status: string;
    readonly turns: number;
    readonly activeTurnId?: string;
    readonly lastTurnStatus?: string;
    /** When the worker session last changed: its most recent turn or status. */
    readonly lastActivityAt: string;
  };
}

export async function listTopics(): Promise<TopicSummary[]> {
  const [documents, state] = await Promise.all([memory().list("topics"), readState()]);
  return Promise.all(
    documents.map(async (document) => {
      const record = state.topics[document.id];
      const session = record?.workerSessionId ? await readSession(record.workerSessionId) : null;
      return {
        id: document.id,
        title: document.title,
        summary: document.summary,
        updatedAt: document.updatedAt,
        archived: record?.archived ?? false,
        agentWrites: document.agentWrites,
        workerSessionId: record?.workerSessionId,
        ...(session ? { work: workStatus(session) } : {}),
      };
    }),
  );
}

function workStatus(session: OcSession) {
  const active = activeTurn(session);
  const last = session.turns[session.turns.length - 1];
  return {
    status: session.status,
    turns: session.turns.length,
    activeTurnId: active?.id,
    lastTurnStatus: last?.status,
    lastActivityAt: session.updatedAt,
  };
}

export interface TopicDetail {
  readonly topic: TopicSummary;
  readonly document: Document;
  readonly session: OcSession | null;
  readonly previousWorkerSessionIds: readonly string[];
}

export async function topicDetail(topicId: string): Promise<TopicDetail | null> {
  const document = await memory().get("topics", topicId);
  if (!document) return null;
  const record = (await readState()).topics[topicId];
  const session = record?.workerSessionId ? await readSession(record.workerSessionId) : null;
  return {
    topic: {
      id: document.id,
      title: document.title,
      summary: document.summary,
      updatedAt: document.updatedAt,
      archived: record?.archived ?? false,
      agentWrites: document.agentWrites,
      workerSessionId: record?.workerSessionId,
      ...(session ? { work: workStatus(session) } : {}),
    },
    document,
    session,
    previousWorkerSessionIds: record?.previousWorkerSessionIds ?? [],
  };
}

// Agent save: the expected revision is the one the app recalled into that
// session before its current turn; the model never supplies one.
export async function agentSaveNotes(
  sessionId: string,
  body: { text: string; summary?: string },
): Promise<SaveResult | { status: "rejected"; reason: "not_bound" }> {
  const state = await readState();
  const topic = Object.values(state.topics).find((candidate) => candidate.workerSessionId === sessionId);
  if (!topic) return { status: "rejected", reason: "not_bound" };
  const expected = topic.recalledRevision[sessionId];
  if (!expected) return { status: "rejected", reason: "not_bound" };
  const result = await memory().replace("topics", topic.id, body, expected, { kind: "agent", sessionId });
  const revision =
    result.status === "saved" ? result.revision : result.status === "conflict" ? result.revision : undefined;
  if (revision) {
    // The session has now observed this revision (its own save, or the current text from a conflict).
    await updateState((current) => {
      const record = current.topics[topic.id];
      if (!record) return { state: current, result: undefined };
      return {
        state: {
          ...current,
          topics: {
            ...current.topics,
            [topic.id]: { ...record, recalledRevision: { ...record.recalledRevision, [sessionId]: revision } },
          },
        },
        result: undefined,
      };
    });
  }
  return result;
}

export async function agentSaveProfile(
  sessionId: string,
  text: string,
): Promise<SaveResult | { status: "rejected"; reason: "not_bound" }> {
  const state = await readState();
  if (state.coordinator?.sessionId !== sessionId || !state.coordinatorRecalledRevision)
    return { status: "rejected", reason: "not_bound" };
  const result = await memory().replace("profile", "owner", { text }, state.coordinatorRecalledRevision, {
    kind: "agent",
    sessionId,
  });
  const revision =
    result.status === "saved" ? result.revision : result.status === "conflict" ? result.revision : undefined;
  if (revision)
    await updateState((current) => ({
      state: { ...current, coordinatorRecalledRevision: revision },
      result: undefined,
    }));
  return result;
}

export async function ownerEditNotes(
  topicId: string,
  body: { text: string; summary?: string },
  expectedRevision: string,
): Promise<SaveResult> {
  return memory().replace("topics", topicId, body, expectedRevision, { kind: "owner" });
}

export async function renameTopic(topicId: string, title: string, expectedRevision: string): Promise<SaveResult> {
  const result = await memory().patch("topics", topicId, { title }, expectedRevision);
  if (result.status !== "saved") return result;
  await updateState((state) => {
    const current = state.topics[topicId];
    if (!current) return { state, result: undefined };
    return { state: { ...state, topics: { ...state.topics, [topicId]: { ...current, title } } }, result: undefined };
  });
  return result;
}

// Archive: disable agent writes first, then end the worker so its access is
// revoked while the notes are already protected. Unarchive re-enables writes;
// the next task gets a fresh worker session bound to the same notes.
export async function setArchived(topicId: string, archived: boolean, expectedRevision: string): Promise<SaveResult> {
  const result = await memory().patch(
    "topics",
    topicId,
    { agentWrites: archived ? "disabled" : "enabled" },
    expectedRevision,
  );
  if (result.status !== "saved") return result;
  const record = (await readState()).topics[topicId];
  if (archived && record?.workerSessionId) {
    try {
      await oc.end(record.workerSessionId);
    } catch {
      /* already ended */
    }
  }
  await updateState((state) => {
    const current = state.topics[topicId];
    if (!current) return { state, result: undefined };
    const next: TopicRecord = archived
      ? { ...current, archived: true }
      : {
          ...current,
          archived: false,
          workerSessionId: undefined,
          previousWorkerSessionIds: current.workerSessionId
            ? [...current.previousWorkerSessionIds, current.workerSessionId]
            : current.previousWorkerSessionIds,
        };
    return { state: { ...state, topics: { ...state.topics, [topicId]: next } }, result: undefined };
  });
  return result;
}

// Deliberate replacement: end the predecessor (revoking its access) and let
// the next task create a successor keyed on the predecessor id, bound to the
// same notes. History links to the old session are kept.
export async function replaceWorker(topicId: string): Promise<{ endedSessionId?: string }> {
  const record = (await readState()).topics[topicId];
  if (!record?.workerSessionId) return {};
  const ended = record.workerSessionId;
  try {
    await oc.end(ended);
  } catch {
    /* already ended */
  }
  await updateState((state) => {
    const current = state.topics[topicId];
    if (!current) return { state, result: undefined };
    return {
      state: {
        ...state,
        topics: {
          ...state.topics,
          [topicId]: {
            ...current,
            workerSessionId: undefined,
            previousWorkerSessionIds: [...current.previousWorkerSessionIds, ended],
          },
        },
      },
      result: undefined,
    };
  });
  return { endedSessionId: ended };
}
