import { create } from "zustand";
import { EMPTY_JOURNAL, type Journal, upsertRows } from "./journal";
import type { JournalRow, SessionInfo, Transport } from "./types";

// Chat agents' state in the renderer, per workspace: the journal (rows upserted
// by id at their highest revision), the agent's SessionInfo, which transport it
// runs on, messages queued while a turn runs, and prompts being answered (so
// their buttons disable).

/** A message typed while the agent was busy, sent once its turn ends. */
export interface QueuedMessage {
  id: string;
  text: string;
  /** Absolute paths of files sent with it. */
  attachments: string[];
}

interface AgentChatState {
  journals: Record<string, Journal>;
  info: Record<string, SessionInfo>;
  /** What each workspace's agent runs on, once known (`transport.ts`). */
  transport: Record<string, Transport>;
  /** The CLIs with a chat adapter (`chat_agent_brands`). */
  brands: string[];
  /** Workspaces whose saved journal has been read. */
  loaded: Record<string, boolean>;
  queues: Record<string, QueuedMessage[]>;
  /** `${workspaceId}:${requestId}` of answers on their way to the agent. */
  answering: Record<string, boolean>;
  /** A queued message was just sent; hold the next until the agent picks it up. */
  sending: Record<string, boolean>;
  /** A queued send failed; hold the queue until the agent is heard from again. */
  paused: Record<string, boolean>;
  /** The chat pane's tab: `"main"`, or the call id of the subagent shown. */
  tab: Record<string, string>;
  applyRows: (workspaceId: string, rows: readonly JournalRow[]) => void;
  /** Replace the journal: the backend renumbered it (terminal turns added to it). */
  resetRows: (workspaceId: string, rows: readonly JournalRow[]) => void;
  setInfo: (workspaceId: string, info: SessionInfo) => void;
  setTransport: (workspaceId: string, transport: Transport) => void;
  setBrands: (brands: string[]) => void;
  markLoaded: (workspaceId: string) => void;
  /** Add a message to the end of the queue, or with `first`, ahead of the rest. */
  enqueue: (workspaceId: string, text: string, attachments?: string[], first?: boolean) => void;
  editQueued: (workspaceId: string, id: string, text: string) => void;
  removeQueued: (workspaceId: string, id: string) => void;
  /** Put a message that failed to send back at the front of the queue, and pause it. */
  requeue: (workspaceId: string, message: QueuedMessage) => void;
  setAnswering: (key: string, on: boolean) => void;
  setSending: (workspaceId: string, on: boolean) => void;
  /** Show the main chat (`"main"`) or a subagent's tab. */
  setTab: (workspaceId: string, tab: string) => void;
}

let nextQueued = 0;

export const useAgentChatStore = create<AgentChatState>((set) => ({
  journals: {},
  info: {},
  transport: {},
  brands: ["claude"],
  loaded: {},
  queues: {},
  answering: {},
  sending: {},
  paused: {},
  tab: {},
  applyRows: (workspaceId, rows) =>
    set((s) => {
      const current = s.journals[workspaceId] ?? EMPTY_JOURNAL;
      const next = upsertRows(current, rows);
      if (next === current) return s;
      // A new turn row means a sent message was picked up.
      const picked = rows.some((r) => r.body.kind === "turn" && r.body.state === "running");
      return {
        journals: { ...s.journals, [workspaceId]: next },
        sending: picked ? { ...s.sending, [workspaceId]: false } : s.sending,
        paused: { ...s.paused, [workspaceId]: false },
      };
    }),
  resetRows: (workspaceId, rows) =>
    set((s) => ({
      journals: { ...s.journals, [workspaceId]: upsertRows(EMPTY_JOURNAL, rows) },
    })),
  setInfo: (workspaceId, info) =>
    set((s) => ({
      info: { ...s.info, [workspaceId]: info },
      // Only a chat agent reports this.
      transport: { ...s.transport, [workspaceId]: "chat" },
      paused: { ...s.paused, [workspaceId]: false },
      sending: info.busy ? { ...s.sending, [workspaceId]: false } : s.sending,
    })),
  setTransport: (workspaceId, transport) =>
    set((s) =>
      s.transport[workspaceId] === transport
        ? s
        : { transport: { ...s.transport, [workspaceId]: transport } }
    ),
  setBrands: (brands) => set({ brands }),
  markLoaded: (workspaceId) => set((s) => ({ loaded: { ...s.loaded, [workspaceId]: true } })),
  enqueue: (workspaceId, text, attachments = [], first = false) =>
    set((s) => {
      nextQueued += 1;
      const queued = { id: `q${nextQueued}`, text, attachments };
      const rest = s.queues[workspaceId] ?? [];
      const queue = first ? [queued, ...rest] : [...rest, queued];
      return { queues: { ...s.queues, [workspaceId]: queue } };
    }),
  editQueued: (workspaceId, id, text) =>
    set((s) => ({
      queues: {
        ...s.queues,
        [workspaceId]: (s.queues[workspaceId] ?? []).map((q) => (q.id === id ? { ...q, text } : q)),
      },
    })),
  removeQueued: (workspaceId, id) =>
    set((s) => ({
      queues: {
        ...s.queues,
        [workspaceId]: (s.queues[workspaceId] ?? []).filter((q) => q.id !== id),
      },
    })),
  requeue: (workspaceId, message) =>
    set((s) => ({
      queues: { ...s.queues, [workspaceId]: [message, ...(s.queues[workspaceId] ?? [])] },
      sending: { ...s.sending, [workspaceId]: false },
      paused: { ...s.paused, [workspaceId]: true },
    })),
  setAnswering: (key, on) =>
    set((s) => {
      const answering = { ...s.answering };
      if (on) answering[key] = true;
      else delete answering[key];
      return { answering };
    }),
  setSending: (workspaceId, on) => set((s) => ({ sending: { ...s.sending, [workspaceId]: on } })),
  setTab: (workspaceId, tab) =>
    set((s) => (s.tab[workspaceId] === tab ? s : { tab: { ...s.tab, [workspaceId]: tab } })),
}));

/** A workspace's journal (empty until loaded). */
export function useJournal(workspaceId: string): Journal {
  return useAgentChatStore((s) => s.journals[workspaceId] ?? EMPTY_JOURNAL);
}

const NO_QUEUE: QueuedMessage[] = [];

export function useQueue(workspaceId: string): QueuedMessage[] {
  return useAgentChatStore((s) => s.queues[workspaceId] ?? NO_QUEUE);
}

import.meta.hot?.accept(() => location.reload());
