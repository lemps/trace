import { useMemo } from "react";
import { ChatMarkdown } from "./ChatMarkdown";
import { type ChatView, ChatViewContext } from "./chatContext";
import { useChat } from "./hooks/useChat";
import { useFollowScroll } from "./hooks/useFollowScroll";
import { useJournalFeed } from "./hooks/useJournalFeed";
import { useWorkspaceRoot } from "./hooks/useWorkspaceRoot";
import { ItemView } from "./ItemView";
import { LatestButton } from "./LatestButton";
import { SubagentBar } from "./SubagentBar";
import { useAgentChatStore } from "./store";
import type { SubagentThread } from "./subagents";

interface SubagentViewProps {
  workspaceId: string;
  /** The call that started the subagent (`SubagentThread.callId`). */
  callId: string;
}

// One subagent's whole conversation, read-only: the brief it was given, its
// thinking and messages, its calls with their output and diffs, and its report.
// Self-contained (it reads the journal itself): it's the subagent's pane tab
// (`subagentPanel.tsx`), under its fact strip (`SubagentBar`). No composer: you
// talk to the agent on its own tab.
export function SubagentView({ workspaceId, callId }: SubagentViewProps) {
  useJournalFeed(workspaceId);
  const root = useWorkspaceRoot(workspaceId);
  const view = useMemo<ChatView>(
    () => ({ workspaceId, root, expandAll: false }),
    [workspaceId, root]
  );
  const thread = useChat(workspaceId).subagents.find((s) => s.callId === callId);
  const loaded = useAgentChatStore((s) => s.loaded[workspaceId] ?? false);
  return (
    <ChatViewContext.Provider value={view}>
      <div className="ac-subview">
        {thread ? (
          <Thread workspaceId={workspaceId} thread={thread} />
        ) : (
          <>
            {/* The strip's place kept, so the view doesn't jump when it fills in. */}
            <div className="ac-head" />
            <div className="tx-empty">
              <div className="ib-empty">
                {loaded ? "This subagent isn't in the conversation." : "Reading the conversation…"}
              </div>
            </div>
          </>
        )}
      </div>
    </ChatViewContext.Provider>
  );
}

function Thread({ workspaceId, thread }: { workspaceId: string; thread: SubagentThread }) {
  const { scrollRef, following, onScroll, jumpToLatest } = useFollowScroll(thread.version);
  const running = thread.status === "running";
  // The report is often its last message too: shown once, as the report.
  const lastItem = thread.items[thread.items.length - 1];
  const reportIsLast =
    lastItem?.type === "message" && lastItem.message.text.trim() === thread.result?.trim();
  const items = reportIsLast ? thread.items.slice(0, -1) : thread.items;
  return (
    <>
      <SubagentBar workspaceId={workspaceId} thread={thread} />
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
