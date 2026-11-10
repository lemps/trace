import { useEffect, useMemo, useState } from "react";
import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import { ChatViewContext } from "@/domains/agentChat/chatContext";
import { useFollowScroll } from "@/domains/agentChat/hooks/useFollowScroll";
import { LatestButton } from "@/domains/agentChat/LatestButton";
import { TurnEnd, WorkingRow } from "@/domains/agentChat/TurnBits";
import { useBoardStore } from "@/domains/board/store";
import { useAgentLight } from "@/domains/live/store";
import type { AgentCli } from "@/ipc/agent";
import type { TranscriptItem } from "@/ipc/transcript";
import { workspaceInfo } from "@/ipc/workspace";
import { type Block, toBlocks, turnStartedAt } from "./blocks";
import { PromptBubble } from "./PromptBubble";
import { ToolRun } from "./ToolRun";
import { useTranscriptFeed } from "./useTranscriptFeed";

interface TranscriptViewProps {
  workspaceId: string;
  cli: AgentCli;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="tx-empty">
      <div className="ib-empty">{text}</div>
    </div>
  );
}

// The agent's conversation, formatted: your prompts, its replies as Markdown, and
// what it did as folded tool runs — read from Claude Code's own transcript, so
// none of the terminal's status lines or redraws. Follows the newest message
// while you're at the bottom, and stays put while you read further up.
export function TranscriptView({ workspaceId, cli }: TranscriptViewProps) {
  if (cli === "codex") {
    return (
      <Empty text="Codex has no transcript trace can read yet, so its agents show the terminal." />
    );
  }
  return <ClaudeTranscript workspaceId={workspaceId} />;
}

function ClaudeTranscript({ workspaceId }: { workspaceId: string }) {
  const feed = useTranscriptFeed(workspaceId);
  const blocks = useMemo(() => toBlocks(feed.items), [feed.items]);
  const [root, setRoot] = useState<string | null>(null);

  // Paths inside the workspace read better relative to it.
  useEffect(() => {
    let cancelled = false;
    void workspaceInfo(workspaceId)
      .then((info) => {
        if (!cancelled) setRoot(info?.cwd ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  if (!feed.loaded) return <Empty text="Reading the conversation…" />;
  if (blocks.length === 0) {
    return (
      <Empty text="Nothing here yet. The transcript fills in as soon as the agent's first message lands." />
    );
  }
  return (
    <TranscriptList workspaceId={workspaceId} items={feed.items} blocks={blocks} root={root} />
  );
}

interface TranscriptListProps {
  workspaceId: string;
  items: readonly TranscriptItem[];
  blocks: Block[];
  root: string | null;
}

// Mounted once there is something to show, so the scroller exists when the
// follow-scroll hook and the jump button measure it.
function TranscriptList({ workspaceId, items, blocks, root }: TranscriptListProps) {
  const light = useAgentLight(workspaceId);
  const running = useBoardStore((s) => s.runningAgents.has(workspaceId));
  const view = useMemo(() => ({ workspaceId, root, expandAll: false }), [workspaceId, root]);
  const working = light === "working";
  // Follows new blocks (and the Working line coming and going) while at the bottom.
  const { scrollRef, following, onScroll, jumpToLatest } = useFollowScroll(blocks, working);

  // The cover holds focus while this loads; once there's something to scroll,
  // the scroller takes it, so arrows and Page keys move it.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && document.activeElement === el.closest(".tx-cover")) el.focus();
  }, [scrollRef]);

  return (
    <ChatViewContext.Provider value={view}>
      <div className="tx-wrap">
        <div className="tx-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={-1}>
          <div className="tx-col">
            {blocks.map((block, i) => (
              <BlockView
                key={blockKey(block)}
                block={block}
                workspaceId={workspaceId}
                root={root}
                isCurrent={working && i === blocks.length - 1}
              />
            ))}
            {working && <WorkingRow since={turnStartedAt(items)} subagents={0} />}
            <div className="tx-foot">
              {running ? "Reply in the terminal" : "Stopped — Start it from the header to carry on"}
            </div>
          </div>
        </div>
        <LatestButton scrollRef={scrollRef} show={!following} onJump={jumpToLatest} />
      </div>
    </ChatViewContext.Provider>
  );
}

function blockKey(block: Block): string {
  return block.type === "tools" ? block.id : block.item.id;
}

interface BlockViewProps {
  block: Block;
  workspaceId: string;
  root: string | null;
  isCurrent: boolean;
}

// A reply's Markdown parse is the costly part of a render; text never changes
// once written, so each new item re-renders the list without re-parsing them
// (ChatMarkdown is memoised on its text). It's the chat view's renderer, so
// file paths link to the editor here too.
function Reply({ text }: { text: string }) {
  return (
    <div className="tx-reply">
      <ChatMarkdown text={text} />
    </div>
  );
}

function BlockView({ block, workspaceId, root, isCurrent }: BlockViewProps) {
  switch (block.type) {
    case "prompt":
      return (
        <PromptBubble>
          <ChatMarkdown text={block.item.text} />
        </PromptBubble>
      );
    case "reply":
      return <Reply text={block.item.text} />;
    case "command":
      return <PromptBubble command>{block.item.text}</PromptBubble>;
    case "notice":
      return <div className="tx-notice">{block.item.text}</div>;
    case "turnEnd":
      return <TurnEnd state="completed" durationMs={block.item.durationMs} />;
    case "tools":
      return (
        <ToolRun steps={block.steps} workspaceId={workspaceId} root={root} isCurrent={isCurrent} />
      );
  }
}
