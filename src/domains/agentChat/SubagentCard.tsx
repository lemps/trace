import { memo } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { ApprovalCard } from "./ApprovalCard";
import { useChatActions } from "./actions";
import { useChatView } from "./chatContext";
import { showSubagentTab } from "./closedTabs";
import type { ToolItem } from "./projection";
import { plainLine, SubagentStatusWord, useElapsed } from "./SubagentBits";
import { openSubagentBeside } from "./subagentPanel";
import type { SubagentThread } from "./subagents";

// A subagent in the main timeline: one card that stays where its call was and
// changes in place (status, time, calls, its latest step, then its report)
// however many rows the subagent adds. Its rows are in its own tab; clicking
// the card opens it. A permission it waits on is answered here too.

function CardBody({ item }: { item: ToolItem }) {
  const thread = item.subagent as SubagentThread;
  const { workspaceId } = useChatView();
  const actions = useChatActions();
  const elapsed = useElapsed(thread);
  const open = () => showSubagentTab(workspaceId, thread.callId);
  const stop = () =>
    void actions
      .stopSubagent(workspaceId, thread.callId)
      .catch((e) => toast.error(`Couldn't stop the subagent: ${String(e)}`));
  const running = thread.status === "running";
  const asks = pendingAsks(thread);
  const line = plainLine(running ? thread.activity : (thread.result ?? thread.activity));
  return (
    <div className={`ac-agent ${thread.status}${thread.pending ? " pending" : ""}`}>
      <div className="ac-agent-top">
        <button
          type="button"
          className="ac-agent-open"
          onClick={open}
          title="Open its conversation in a tab"
        >
          <I.Sparkles size={13} />
          {thread.agentType && <span className="ac-agent-type">{thread.agentType}</span>}
          <span className="ac-agent-desc">
            {thread.description ?? (thread.agentType ? "" : thread.label)}
          </span>
          <span className="ac-agent-facts">
            <SubagentStatusWord thread={thread} />
            {elapsed && <span>{elapsed}</span>}
            <span>
              {thread.toolCount} {thread.toolCount === 1 ? "call" : "calls"}
            </span>
            {thread.background && <span>background</span>}
          </span>
          <span className="ac-agent-go" aria-hidden>
            <I.Chevron size={12} />
          </span>
        </button>
        <button
          type="button"
          className="btn icon ac-agent-stop ac-agent-beside"
          onClick={() => openSubagentBeside(workspaceId, thread.callId)}
          title="Open beside: its conversation in a pane next to the chat"
          aria-label="Open beside"
        >
          <I.SplitRight size={13} />
        </button>
        {running && (
          <button type="button" className="btn ac-agent-stop" onClick={stop}>
            <I.Stop size={13} /> Stop subagent
          </button>
        )}
      </div>
      {line && <div className={`ac-agent-line${running ? "" : " result"}`}>{line}</div>}
      {asks.map((a) => (
        <div key={a.requestId} className="ac-tool-attached">
          <ApprovalCard approval={a} />
        </div>
      ))}
    </div>
  );
}

/** Permission requests still open in the subagent (or ones it started). */
function pendingAsks(thread: SubagentThread) {
  const out = [];
  for (const item of thread.items) {
    if (item.type === "tool" && item.approval && !item.approval.approval.resolution) {
      out.push(item.approval.approval);
    }
    if (item.type === "approval" && !item.approval.resolution) out.push(item.approval);
  }
  return out;
}

/** Re-renders only when the subagent's rows change (see `ToolItem.version`). */
export const SubagentCard = memo(
  CardBody,
  (a, b) => a.item.row.id === b.item.row.id && a.item.version === b.item.version
);
