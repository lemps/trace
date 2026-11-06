import { create } from "zustand";
import { readTranscript, type TranscriptItem } from "@/ipc/transcript";

/** How an agent's chat pane shows it: the formatted transcript, or the live TUI. */
export type AgentView = "transcript" | "terminal";

/** One workspace's conversation as read so far. */
export interface Feed {
  /** The conversation `offset` belongs to; null before the first read. */
  sessionId: string | null;
  offset: number;
  items: TranscriptItem[];
  /** A read has completed at least once (so "nothing yet" is real, not loading). */
  loaded: boolean;
}

interface TranscriptState {
  feeds: Record<string, Feed>;
  /** Each workspace's chosen view; unset ones use `preferred`. */
  views: Record<string, AgentView>;
  /** The view last picked anywhere — what an agent opens in until you pick for it. */
  preferred: AgentView;
  /** Read whatever the conversation gained since the last read. */
  refresh: (workspaceId: string) => Promise<void>;
  setView: (workspaceId: string, view: AgentView) => void;
}

/** Items kept per workspace; the backend sends at most 1500 per read. */
const MAX_ITEMS = 2000;

const PREFERRED_KEY = "trace.agentView";

const EMPTY_FEED: Feed = { sessionId: null, offset: 0, items: [], loaded: false };

// One read per workspace at a time: two overlapping reads from the same offset
// would append the same items twice. A refresh asked for meanwhile (a turn
// ending mid-poll, the agent's last poll) runs once the read in flight lands.
const inFlight = new Set<string>();
const again = new Set<string>();

function loadPreferred(): AgentView {
  try {
    return localStorage.getItem(PREFERRED_KEY) === "transcript" ? "transcript" : "terminal";
  } catch {
    return "terminal";
  }
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  feeds: {},
  views: {},
  preferred: loadPreferred(),
  refresh: async (workspaceId) => {
    if (inFlight.has(workspaceId)) {
      again.add(workspaceId);
      return;
    }
    inFlight.add(workspaceId);
    try {
      const feed = get().feeds[workspaceId] ?? EMPTY_FEED;
      const page = await readTranscript(workspaceId, feed.sessionId, feed.offset);
      const current = get().feeds[workspaceId] ?? EMPTY_FEED;
      let next: Feed;
      if (!page) {
        // No conversation (yet, or any more). Already showing that: change nothing.
        if (current.loaded && current.items.length === 0) return;
        next = { ...EMPTY_FEED, loaded: true };
      } else if (page.reset) {
        next = { sessionId: page.sessionId, offset: page.offset, items: page.items, loaded: true };
      } else if (page.offset === current.offset && current.loaded) {
        return; // Nothing new — keep the same object so nothing re-renders.
      } else {
        const items = current.items.concat(page.items);
        next = {
          sessionId: page.sessionId,
          offset: page.offset,
          items: items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items,
          loaded: true,
        };
      }
      set((s) => ({ feeds: { ...s.feeds, [workspaceId]: next } }));
    } catch {
      // A failed read leaves the feed as it was; the next poll tries again.
    } finally {
      inFlight.delete(workspaceId);
      if (again.delete(workspaceId)) void get().refresh(workspaceId);
    }
  },
  setView: (workspaceId, view) => {
    try {
      localStorage.setItem(PREFERRED_KEY, view);
    } catch {
      // Private storage off: the choice just doesn't outlive this run.
    }
    set((s) => ({ views: { ...s.views, [workspaceId]: view }, preferred: view }));
  },
}));

/** The view a workspace's chat pane shows. */
export function useAgentView(workspaceId: string): AgentView {
  return useTranscriptStore((s) => s.views[workspaceId] ?? s.preferred);
}

import.meta.hot?.accept(() => location.reload());
