// The notes editor's state, as a pure reducer so the honesty rules are
// testable: "saved" only after the server confirmed, a conflict always shows
// the server's text, server changes never overwrite an unsaved draft.
export interface NotesBase {
  readonly text: string;
  readonly summary: string;
  readonly revision: string;
  readonly updatedAt: string;
  readonly writer: { readonly kind: "owner" | "agent"; readonly sessionId?: string };
}

export interface NotesState {
  /** What the server holds, as last loaded or saved. */
  readonly base: NotesBase;
  readonly draft: { readonly text: string; readonly summary: string };
  readonly status: "idle" | "saving" | "saved" | "conflict" | "error";
  /** The server's current document when a save was refused. */
  readonly conflict?: { readonly text: string; readonly summary: string; readonly revision: string };
  /** A newer revision arrived while the draft was dirty; the next save will conflict. */
  readonly behind?: NotesBase;
  readonly error?: string;
  readonly savedAt?: number;
}

export type NotesEvent =
  | { readonly type: "loaded"; readonly base: NotesBase }
  | { readonly type: "edit"; readonly text?: string; readonly summary?: string }
  | { readonly type: "save" }
  | { readonly type: "saved"; readonly revision: string; readonly at: number }
  | { readonly type: "conflict"; readonly text: string; readonly summary: string; readonly revision: string }
  | { readonly type: "failed"; readonly error: string }
  | { readonly type: "take-server" }
  | { readonly type: "keep-mine" }
  | { readonly type: "discard" };

export function initialNotes(base: NotesBase): NotesState {
  return { base, draft: { text: base.text, summary: base.summary }, status: "idle" };
}

export function isDirty(state: NotesState): boolean {
  return state.draft.text !== state.base.text || state.draft.summary !== state.base.summary;
}

export function notesReducer(state: NotesState, event: NotesEvent): NotesState {
  switch (event.type) {
    case "loaded": {
      if (event.base.revision === state.base.revision) return state;
      // A save in flight, or a stale fetch that resolved after a newer save:
      // the server's answer to our own write is what counts.
      if (state.status === "saving" || event.base.updatedAt < state.base.updatedAt) return state;
      // Clean editor: adopt the server's text. Dirty editor: keep the draft
      // and remember that the server moved on.
      if (!isDirty(state) && state.status !== "conflict") return initialNotes(event.base);
      return { ...state, behind: event.base };
    }
    case "edit":
      return {
        ...state,
        draft: { text: event.text ?? state.draft.text, summary: event.summary ?? state.draft.summary },
        status: state.status === "conflict" ? "conflict" : "idle",
        error: undefined,
      };
    case "save":
      return { ...state, status: "saving", error: undefined };
    case "saved":
      return {
        base: {
          ...state.base,
          text: state.draft.text,
          summary: state.draft.summary,
          revision: event.revision,
          updatedAt: new Date(event.at).toISOString(),
          writer: { kind: "owner" },
        },
        draft: state.draft,
        status: "saved",
        savedAt: event.at,
      };
    case "conflict":
      return {
        ...state,
        status: "conflict",
        conflict: { text: event.text, summary: event.summary, revision: event.revision },
        behind: undefined,
      };
    case "failed":
      return { ...state, status: "error", error: event.error };
    case "take-server": {
      const server = state.conflict ?? state.behind;
      if (!server) return state;
      const base: NotesBase = {
        ...(state.behind ?? state.base),
        text: server.text,
        summary: server.summary,
        revision: server.revision,
      };
      return initialNotes(base);
    }
    case "keep-mine": {
      // Retry the draft against the server's current revision, on purpose.
      const server = state.conflict ?? state.behind;
      if (!server) return state;
      return {
        ...state,
        base: {
          ...(state.behind ?? state.base),
          text: server.text,
          summary: server.summary,
          revision: server.revision,
        },
        status: "idle",
        conflict: undefined,
        behind: undefined,
      };
    }
    case "discard":
      return initialNotes(state.behind ?? state.base);
    default:
      return state;
  }
}
