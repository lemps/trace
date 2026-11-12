import { useContext } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { PaneAreaContext } from "@/domains/panes/context";
import { groupOf } from "@/domains/panes/model";
import { useChatActions } from "./actions";
import { SubagentStatusWord, useElapsed } from "./SubagentBits";
import { useAgentChatStore } from "./store";
import { openSubagentBeside, subagentPanelId } from "./subagentPanel";
import type { SubagentThread } from "./subagents";

// A subagent tab's fact strip: where the agent's tab has its chat header
// (`ChatHeader`), the same 36px strip (`.ac-head`), so nothing moves when you step
// between them. On the left the way back — the agent's name, a button to its tab —
// then the subagent's label; on the right its facts, Open beside while it shares
// a pane with its agent, and Stop while it runs.

export function SubagentBar({
  workspaceId,
  thread,
}: {
  workspaceId: string;
  thread: SubagentThread;
}) {
  const actions = useChatActions();
  const elapsed = useElapsed(thread);
  const parent = useParent(workspaceId, thread.callId);
  const running = thread.status === "running";
  const stop = () =>
    void actions
      .stopSubagent(workspaceId, thread.callId)
      .catch((e) => toast.error(`Couldn't stop the subagent: ${String(e)}`));
  return (
    <div className="ac-head ac-subhead">
      <button
        type="button"
        className="ac-crumb"
        onClick={parent.show}
        disabled={!parent.tab}
        aria-label={`Back to ${parent.name}`}
      >
        <I.Chat size={14} />
        <span className="ac-head-agent">{parent.name}</span>
      </button>
      <span className="ac-subhead-sep">
        <I.Chevron size={12} />
      </span>
      <span className="ac-subhead-label" title={thread.label}>
        {thread.label}
      </span>
      <span className="ac-agent-facts ac-subhead-facts">
        {thread.agentType && <span>{thread.agentType}</span>}
        <SubagentStatusWord thread={thread} />
        {elapsed && <span>{elapsed}</span>}
        <span>
          {thread.toolCount} {thread.toolCount === 1 ? "call" : "calls"}
        </span>
        {thread.background && <span>Background</span>}
      </span>
      {parent.besideOffered && (
        <IconButton
          size="sm"
          className="ac-agent-beside"
          onClick={() => openSubagentBeside(workspaceId, thread.callId)}
          title="Open beside: its conversation in a pane next to the agent's"
          label="Open beside"
        >
          <I.SplitRight size={14} />
        </IconButton>
      )}
      {running && (
        <button type="button" className="btn sm ac-agent-stop" onClick={stop}>
          <I.Stop size={14} /> Stop subagent
        </button>
      )}
    </div>
  );
}

/**
 * The agent a subagent belongs to, as its tab in this detail: its name (the tab's
 * when the detail hosts several agents, so it says which; else the agent's own,
 * as its chat header has it), showing its tab, and whether Open beside has
 * somewhere to go — the subagent shares a pane with its agent. Outside a pane
 * area (none today) there's no tab to go back to.
 */
function useParent(workspaceId: string, callId: string) {
  const area = useContext(PaneAreaContext);
  const agent = useAgentChatStore((s) => s.info[workspaceId]?.agent);
  const panes = area?.panes;
  const tab = panes?.owners[workspaceId];
  const several = Object.keys(panes?.owners ?? {}).length > 1;
  const tabLabel = tab ? panes?.panels.get(tab)?.label : undefined;
  const name = (several ? tabLabel : agent) ?? agent ?? tabLabel ?? "Agent";
  const home = panes ? groupOf(panes.layout, subagentPanelId(workspaceId, callId)) : undefined;
  const besideOffered =
    !area?.narrow && home !== undefined && tab !== undefined && home.tabs.includes(tab);
  return {
    name,
    tab,
    besideOffered,
    show: () => {
      if (tab) panes?.select(tab);
    },
  };
}
