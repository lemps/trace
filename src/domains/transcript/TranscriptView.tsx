import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { I } from "@/components/Icon";
import { ChatMarkdown } from "@/domains/agentChat/ChatMarkdown";
import { ChatViewContext } from "@/domains/agentChat/chatContext";
import { useBoardStore } from "@/domains/board/store";
import { useAgentLight } from "@/domains/live/store";
import type { AgentCli } from "@/ipc/agent";
import { workspaceInfo } from "@/ipc/workspace";
import { useHint } from "@/platform/shortcuts";
import { type Block, formatDuration, toBlocks } from "./blocks";
import { ToolRun } from "./ToolRun";
import { useTranscriptFeed } from "./useTranscriptFeed";

interface TranscriptViewProps {
  workspaceId: string;
  cli: AgentCli;
}

/** Within this many px of the bottom counts as "following along". */
const STICK_PX = 48;

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
  const viewKey = useHint("agentView");
  const feed = useTranscriptFeed(workspaceId);
  const light = useAgentLight(workspaceId);
  const running = useBoardStore((s) => s.runningAgents.has(workspaceId));
  const blocks = useMemo(() => toBlocks(feed.items), [feed.items]);
  const [root, setRoot] = useState<string | null>(null);
  const view = useMemo(() => ({ workspaceId, root, expandAll: false }), [workspaceId, root]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);

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

  // New items while following: keep the newest in view (before paint, no jump).
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever blocks change
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  // The cover holds focus while this loads; once there's something to scroll,
  // the scroller takes it, so arrows and Page keys move it.
  const hasBlocks = feed.loaded && blocks.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (hasBlocks && el && document.activeElement === el.closest(".tx-cover")) el.focus();
  }, [hasBlocks]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    followingRef.current = near;
    setFollowing(near);
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  if (!feed.loaded) return <Empty text="Reading the conversation…" />;
  if (blocks.length === 0) {
    return (
      <Empty text="Nothing here yet. The transcript fills in as soon as the agent's first message lands." />
    );
  }
  const working = light === "working";
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
            {working && <div className="tx-working">Working…</div>}
            <div className="tx-foot">
              {running ? "Reply in the terminal" : "Stopped — Start it from the header to carry on"}{" "}
              · <span className="kbd">{viewKey}</span> switches views
            </div>
          </div>
        </div>
        {!following && (
          <button type="button" className="btn tx-latest" onClick={jumpToLatest}>
            <I.Download size={13} /> Latest
          </button>
        )}
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
        <div className="tx-prompt">
          <div className="tx-bubble">
            <ChatMarkdown text={block.item.text} />
          </div>
        </div>
      );
    case "reply":
      return <Reply text={block.item.text} />;
    case "command":
      return (
        <div className="tx-prompt">
          <div className="tx-bubble tx-command">{block.item.text}</div>
        </div>
      );
    case "notice":
      return <div className="tx-notice">{block.item.text}</div>;
    case "turnEnd":
      return (
        <div className="tx-turn-end">
          <span>Worked for {formatDuration(block.item.durationMs)}</span>
        </div>
      );
    case "tools":
      return (
        <ToolRun steps={block.steps} workspaceId={workspaceId} root={root} isCurrent={isCurrent} />
      );
  }
}
