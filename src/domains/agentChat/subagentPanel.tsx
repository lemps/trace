import { useMemo } from "react";
import { I } from "@/components/Icon";
import { openPanel, registerPanelKind } from "@/domains/panes/registry";
import { useShownOf } from "@/domains/panes/shown";
import { chatOf, useSubagents } from "./hooks/useChat";
import { SubagentMark } from "./SubagentBits";
import { SubagentView } from "./SubagentView";
import { useAgentChatStore } from "./store";

// A subagent's conversation as a pane of its own, beside its agent's tab
// (`domains/panes`). Panels are named `sub:<agentWorkspaceId>:<callId>`; any detail
// hosting that agent can show one, and a stored layout naming one comes back after
// a reload. Once the agent's journal is loaded and the subagent isn't in it, the
// panel resolves to nothing and the layout drops it.

const PREFIX = "sub";

export const subagentPanelId = (workspaceId: string, callId: string) =>
  `${PREFIX}:${workspaceId}:${callId}`;

/**
 * Open a subagent in a pane to the right of its agent's tab (or show and focus that
 * pane, if open). The chat goes back to Main: one subagent isn't shown twice.
 */
export function openSubagentBeside(workspaceId: string, callId: string): void {
  openPanel(subagentPanelId(workspaceId, callId), "right");
  const store = useAgentChatStore.getState();
  if (store.tab[workspaceId] === callId) store.setTab(workspaceId, "main");
}

/** Which of an agent's subagents are open in a pane of their own, by call id. */
export function useSubagentsInPanes(
  workspaceId: string,
  subagents: readonly { callId: string }[]
): ReadonlySet<string> {
  const shown = useShownOf(subagents.map((s) => subagentPanelId(workspaceId, s.callId)));
  return useMemo(
    () => new Set(shown ? shown.split("\n").map((id) => id.slice(id.lastIndexOf(":") + 1)) : []),
    [shown]
  );
}

/** The tab's status mark, live without re-resolving the panel. */
function SubagentBadge({ workspaceId, callId }: { workspaceId: string; callId: string }) {
  const s = useSubagents(workspaceId).find((x) => x.callId === callId);
  return s ? <SubagentMark status={s.status} pending={s.pending} /> : null;
}

function lookup(workspaceId: string, callId: string) {
  const { journals, loaded } = useAgentChatStore.getState();
  const journal = journals[workspaceId];
  const thread = journal ? chatOf(journal.rows).subagents.find((t) => t.callId === callId) : null;
  return { loaded: loaded[workspaceId] ?? false, thread };
}

registerPanelKind({
  prefix: PREFIX,
  resolve(rest) {
    // Call ids have no colon; a workspace id might.
    const cut = rest.lastIndexOf(":");
    if (cut <= 0) return null;
    const owner = rest.slice(0, cut);
    const callId = rest.slice(cut + 1);
    const { loaded, thread } = lookup(owner, callId);
    // Not loaded yet (straight after a reload): keep it; the view loads the journal.
    if (loaded && !thread) return null;
    return {
      owner,
      panel: {
        id: subagentPanelId(owner, callId),
        label: thread?.label ?? "Subagent",
        icon: I.Sparkles,
        title: thread ? `Subagent: ${thread.label}` : "Subagent",
        section: "subagents",
        optional: true,
        badge: <SubagentBadge workspaceId={owner} callId={callId} />,
        render: () => <SubagentView workspaceId={owner} callId={callId} />,
      },
    };
  },
  subscribe: (onChange) => useAgentChatStore.subscribe(onChange),
  // Which subagents each loaded agent has, and their labels: what resolve reads.
  version: () => {
    const { journals, loaded } = useAgentChatStore.getState();
    return Object.entries(journals)
      .map(([ws, j]) => {
        const subs = chatOf(j.rows).subagents.map((t) => `${t.callId}=${t.label}`);
        return `${ws}${loaded[ws] ? "+" : "-"}${subs.join(",")}`;
      })
      .join(";");
  },
});
