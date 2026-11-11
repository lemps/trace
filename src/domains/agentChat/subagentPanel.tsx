import type { ReactNode } from "react";
import type { IconProps } from "@/components/Icon";
import { I } from "@/components/Icon";
import type { MenuItem } from "@/components/PopMenu";
import { openPanel, registerPanelKind, runSection, showPanel } from "@/domains/panes/registry";
import { closeSubagentTabs, isTabClosed, reopenSubagentTab, useClosedTabs } from "./closedTabs";
import { chatOf, useChat } from "./hooks/useChat";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { SubagentMark } from "./SubagentBits";
import { SubagentView } from "./SubagentView";
import { useAgentChatStore } from "./store";
import type { SubagentThread } from "./subagents";
import { useAgentTransport } from "./transport";

// Each subagent of a chat agent is a tab in its detail's pane strip
// (`domains/panes`), right after the agent's tab and its earlier subagents, in the
// agent's run (`runSection`). Panels are named `sub:<agentWorkspaceId>:<callId>`.
// A tab appears when its subagent starts, without taking the view; a finished one
// closes (its ×, middle-click, its menu), which only hides it (`closedTabs.ts`) —
// its card in the chat, or Open beside, brings it back. A stored layout naming one
// comes back after a reload; once the agent's journal is loaded and the subagent
// isn't in it, or the agent now runs in a terminal, it resolves to nothing and the
// layout drops it.

const PREFIX = "sub";

export const subagentPanelId = (workspaceId: string, callId: string) =>
  `${PREFIX}:${workspaceId}:${callId}`;

/** Show a subagent's tab and focus its pane, bringing it back if it was closed. */
export function showSubagentTab(workspaceId: string, callId: string): void {
  reopenSubagentTab(workspaceId, callId);
  showPanel(subagentPanelId(workspaceId, callId));
}

/** Move a subagent's tab to a pane right of its agent's (or show that pane, if it has one). */
export function openSubagentBeside(workspaceId: string, callId: string): void {
  reopenSubagentTab(workspaceId, callId);
  openPanel(subagentPanelId(workspaceId, callId), "right");
}

/** A subagent still going (or waiting on you) keeps its tab; a finished one can close. */
const closable = (s: SubagentThread) => s.status !== "running" && !s.pending;

/** How a subagent is doing, in its tooltip: the agent-state words, then the ends. */
const WORDS = { running: "working", done: "done", failed: "failed", stopped: "stopped" };
const calls = (n: number) => `${n} ${n === 1 ? "call" : "calls"}`;
const describe = (s: SubagentThread) =>
  `${s.label}${s.agentType ? ` (${s.agentType})` : ""}: ${s.pending ? "needs you" : WORDS[s.status]}, ${calls(s.toolCount)}`;

/**
 * A tab's mark: how its subagent is doing, live without re-resolving the panel. It
 * reads the agent's journal and transport in, so a tab a stored layout brought back
 * gets its name (or goes) without the agent's own tab having been shown.
 */
function TabMark({ workspaceId, callId }: { workspaceId: string; callId: string }) {
  useJournalFeed(workspaceId);
  useAgentTransport(workspaceId);
  const s = useChat(workspaceId).subagents.find((x) => x.callId === callId);
  return s ? <SubagentMark status={s.status} pending={s.pending} /> : <I.Sparkles size={12} />;
}

// One mark component per tab, so a re-resolved panel doesn't remount it (a spinner
// that restarted on every call would flicker).
const marks = new Map<string, (p: IconProps) => ReactNode>();
function markOf(workspaceId: string, callId: string) {
  const id = subagentPanelId(workspaceId, callId);
  let mark = marks.get(id);
  if (!mark) {
    mark = () => <TabMark workspaceId={workspaceId} callId={callId} />;
    marks.set(id, mark);
  }
  return mark;
}

/** What a subagent's tab offers in its right-click menu, beside the pane's own items. */
function menuOf(workspaceId: string, thread: SubagentThread, all: SubagentThread[]): MenuItem[] {
  const finished = all.filter((s) => closable(s) && !isTabClosed(workspaceId, s.callId));
  return [
    { label: "Open beside", onSelect: () => openSubagentBeside(workspaceId, thread.callId) },
    {
      label: "Close",
      disabled: !closable(thread),
      detail: closable(thread) ? undefined : "It's still working, or waiting on you",
      onSelect: () => closeSubagentTabs(workspaceId, [thread.callId]),
    },
    {
      label: "Close finished",
      disabled: finished.length === 0,
      onSelect: () =>
        closeSubagentTabs(
          workspaceId,
          finished.map((s) => s.callId)
        ),
    },
  ];
}

/** The agent's subagents as far as its tabs go: none for an agent now in a terminal. */
function threadsOf(workspaceId: string): { loaded: boolean; threads: SubagentThread[] | null } {
  const { journals, loaded, transport } = useAgentChatStore.getState();
  const journal = journals[workspaceId];
  if (transport[workspaceId] === "terminal") return { loaded: true, threads: [] };
  return {
    loaded: loaded[workspaceId] ?? false,
    threads: journal ? chatOf(journal.rows).subagents : null,
  };
}

registerPanelKind({
  prefix: PREFIX,
  resolve(rest) {
    // Call ids have no colon; a workspace id might.
    const cut = rest.lastIndexOf(":");
    if (cut <= 0) return null;
    const owner = rest.slice(0, cut);
    const callId = rest.slice(cut + 1);
    if (isTabClosed(owner, callId)) return null;
    const { loaded, threads } = threadsOf(owner);
    const thread = threads?.find((t) => t.callId === callId);
    // Not loaded yet (straight after a reload): keep it; the agent's chat loads the journal.
    if (loaded && !thread) return null;
    return {
      owner,
      panel: {
        id: subagentPanelId(owner, callId),
        label: thread?.label || "Subagent",
        icon: markOf(owner, callId),
        title: thread ? describe(thread) : "Subagent",
        section: runSection(owner),
        optional: true,
        closable: thread ? closable(thread) : true,
        onClose: () => closeSubagentTabs(owner, [callId]),
        menu: thread ? menuOf(owner, thread, threads ?? []) : undefined,
        render: () => <SubagentView workspaceId={owner} callId={callId} />,
      },
    };
  },
  // Only for an agent known to run as a chat: a journal left from an earlier chat run
  // of one now in a terminal (or not known yet) places nothing.
  owned(owner) {
    if (useAgentChatStore.getState().transport[owner] !== "chat") return [];
    const { threads } = threadsOf(owner);
    return (threads ?? [])
      .filter((t) => !isTabClosed(owner, t.callId))
      .map((t) => subagentPanelId(owner, t.callId));
  },
  subscribe: (onChange) => {
    const offChat = useAgentChatStore.subscribe(onChange);
    const offClosed = useClosedTabs.subscribe(onChange);
    return () => {
      offChat();
      offClosed();
    };
  },
  // What resolve and owned read: each agent's subagents (label, state, calls), whether
  // it's loaded or in a terminal, and which tabs were closed.
  version: () => {
    const { journals, loaded, transport } = useAgentChatStore.getState();
    const agents = Object.entries(journals).map(([ws, j]) => {
      const subs = chatOf(j.rows).subagents.map(
        (t) => `${t.callId}=${t.label}/${t.status}/${t.pending}/${t.toolCount}`
      );
      return `${ws}${loaded[ws] ? "+" : "-"}${transport[ws] ?? ""}:${subs.join(",")}`;
    });
    const known = Object.entries(transport).map(([ws, t]) => `${ws}=${t}`);
    return `${agents.join(";")}#${known.join(";")}#${closedSerial()}`;
  },
});

// The closed lists can run to hundreds of ids: a number that changes with them
// stands in for them in the version, which is read on every chat update.
let closedSeen: object | null = null;
let closedCount = 0;
function closedSerial(): number {
  const { closed } = useClosedTabs.getState();
  if (closed !== closedSeen) {
    closedSeen = closed;
    closedCount += 1;
  }
  return closedCount;
}
