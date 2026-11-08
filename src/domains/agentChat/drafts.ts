import { create } from "zustand";
import { type Draft, type Drafts, debounce, parseDrafts, withDraft } from "./draftModel";

// Each workspace's half-written message (its text and attached files), kept while
// the composer is off screen: the detail closed, another ticket open, trace restarted.
// Saved to localStorage here, once, a moment after typing stops (and straight away
// when the window closes); sending clears it.

const KEY = "trace.composerDrafts";
/** Quiet time before a save: long enough to skip every keystroke. */
const SAVE_AFTER_MS = 400;

function load(): Drafts {
  try {
    return parseDrafts(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return {};
  }
}

interface DraftStore {
  drafts: Drafts;
  setText: (workspaceId: string, text: string) => void;
  /** Swap the files going with the message. */
  setAttachments: (workspaceId: string, paths: string[]) => void;
  /** Add files, each once. */
  addAttachments: (workspaceId: string, paths: string[]) => void;
  clear: (workspaceId: string) => void;
}

export const useDrafts = create<DraftStore>((set) => {
  const change = (workspaceId: string, patch: Partial<Pick<Draft, "text" | "attachments">>) =>
    set((s) => ({ drafts: withDraft(s.drafts, workspaceId, patch, Date.now()) }));
  return {
    drafts: load(),
    setText: (workspaceId, text) => change(workspaceId, { text }),
    setAttachments: (workspaceId, attachments) => change(workspaceId, { attachments }),
    addAttachments: (workspaceId, paths) =>
      set((s) => {
        const was = s.drafts[workspaceId]?.attachments ?? [];
        const attachments = [...new Set([...was, ...paths])];
        return { drafts: withDraft(s.drafts, workspaceId, { attachments }, Date.now()) };
      }),
    clear: (workspaceId) => change(workspaceId, { text: "", attachments: [] }),
  };
});

const NO_FILES: string[] = [];

/** A workspace's draft text ("" when there's none). */
export const useDraftText = (workspaceId: string) =>
  useDrafts((s) => s.drafts[workspaceId]?.text ?? "");

/** A workspace's attached files. */
export const useDraftFiles = (workspaceId: string) =>
  useDrafts((s) => s.drafts[workspaceId]?.attachments ?? NO_FILES);

const save = debounce(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(useDrafts.getState().drafts));
  } catch {
    // Storage full or off: the draft still lives until trace closes.
  }
}, SAVE_AFTER_MS);

useDrafts.subscribe((s, was) => {
  if (s.drafts !== was.drafts) save.schedule();
});
window.addEventListener("pagehide", save.flush);
window.addEventListener("beforeunload", save.flush);

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
