import { useMemo } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { useChatActions } from "./actions";
import { ChatMarkdown } from "./ChatMarkdown";
import { type ChatView, ChatViewContext, useChatView } from "./chatContext";
import { useChat } from "./hooks/useChat";
import { useFollowScroll } from "./hooks/useFollowScroll";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { useWorkspaceRoot } from "./hooks/useWorkspaceRoot";
import { ItemView } from "./ItemView";
import { LatestButton } from "./LatestButton";
import { SubagentStatusWord, useElapsed } from "./SubagentBits";
import { openSubagentBeside } from "./subagentPanel";
import type { SubagentThread } from "./subagents";

interface SubagentViewProps {
  workspaceId: string;
  /** The call that started the subagent (`useSubagents(...)[i].callId`). */
  callId: string;
}

// One subagent's whole conversation, read-only: the brief it was given, its
// thinking and messages, its calls with their output and diffs, and its report.
// Self-contained (it reads the journal itself), so the chat pane shows it as a
// tab and a layout can put it in a pane of its own beside the main chat.
export function SubagentView({ workspaceId, callId }: SubagentViewProps) {
  useJournalFeed(workspaceId);
  const outer = useChatView();
  const fetched = useWorkspaceRoot(workspaceId);
  const inPane = outer.workspaceId === workspaceId;
  const root = inPane ? outer.root : fetched;
  const expandAll = inPane && outer.expandAll;
  const view = useMemo<ChatView>(
    () => ({ workspaceId, root, expandAll }),
    [workspaceId, root, expandAll]
  );
  const thread = useChat(workspaceId).subagents.find((s) => s.callId === callId);
  return (
    <ChatViewContext.Provider value={view}>
      <div className="ac-subview">
        {thread ? (
          <Thread thread={thread} inChat={inPane} />
        ) : (
          <div className="tx-empty">
            <div className="ib-empty">This subagent isn't in the conversation.</div>
          </div>
        )}
      </div>
    </ChatViewContext.Provider>
  );
}

/** `inChat`: shown as a tab of the chat pane, so it can open beside it instead. */
function Thread({ thread, inChat }: { thread: SubagentThread; inChat: boolean }) {
  const { workspaceId } = useChatView();
  const actions = useChatActions();
  const elapsed = useElapsed(thread);
  const { scrollRef, following, onScroll, jumpToLatest } = useFollowScroll(thread.version);
  const running = thread.status === "running";
  const stop = () =>
    void actions
      .stopSubagent(workspaceId, thread.callId)
      .catch((e) => toast.error(`Couldn't stop the subagent: ${String(e)}`));
  // The report is often its last message too: shown once, as the report.
  const lastItem = thread.items[thread.items.length - 1];
  const reportIsLast =
    lastItem?.type === "message" && lastItem.message.text.trim() === thread.result?.trim();
  const items = reportIsLast ? thread.items.slice(0, -1) : thread.items;
  return (
    <>
      <div className="ac-subview-head">
        <I.Sparkles size={13} />
        <span className="ac-subview-title" title={thread.label}>
          {thread.label}
        </span>
        <span className="ac-agent-facts">
          {thread.agentType && <span>{thread.agentType}</span>}
          <SubagentStatusWord thread={thread} />
          {elapsed && <span>{elapsed}</span>}
          <span>
            {thread.toolCount} {thread.toolCount === 1 ? "call" : "calls"}
          </span>
          {thread.background && <span>background</span>}
        </span>
        {inChat && (
          <button
            type="button"
            className="btn ac-agent-stop"
            onClick={() => openSubagentBeside(workspaceId, thread.callId)}
            title="Show it in a pane beside the chat"
          >
            <I.SplitRight size={13} /> Open beside
          </button>
        )}
        {running && (
          <button type="button" className="btn ac-agent-stop" onClick={stop}>
            <I.X size={13} /> Stop subagent
          </button>
        )}
      </div>
      <div className="tx-wrap">
        <div className="tx-scroll ac-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={-1}>
          <div className="tx-col ac-col">
            {thread.brief && (
              <div className="ac-brief">
                <div className="ac-brief-label">Brief</div>
                <ChatMarkdown text={thread.brief} />
              </div>
            )}
            {items.map((item) => (
              <ItemView key={item.row.id} item={item} />
            ))}
            {items.length === 0 && running && (
              <div className="tx-notice">Starting… its calls and messages show up here.</div>
            )}
            {thread.result && (
              <div className="ac-report">
                <div className="ac-brief-label">Report</div>
                <ChatMarkdown text={thread.result} />
              </div>
            )}
            {!running && !thread.result && (
              <div className="tx-notice">
                {thread.status === "done" ? "It finished without a report." : "It ended early."}
              </div>
            )}
          </div>
        </div>
        <LatestButton scrollRef={scrollRef} show={!following} onJump={jumpToLatest} />
      </div>
    </>
  );
}
