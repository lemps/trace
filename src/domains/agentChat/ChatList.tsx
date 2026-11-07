import { useState } from "react";
import { I } from "@/components/Icon";
import { useFollowScroll } from "./hooks/useFollowScroll";
import type { ChatTurn } from "./projection";
import { WorkingRow } from "./TurnBits";
import { TurnView } from "./TurnView";

interface ChatListProps {
  turns: ChatTurn[];
  /** A turn runs, or subagents still work after theirs. */
  working: boolean;
  /** When the running turn started (unix ms), for the working timer; null between turns. */
  since: number | null;
  /** Subagents still running. */
  subagents: number;
  onInterrupt: () => void;
}

/** Turns drawn at first, and added per "Show earlier". */
const PAGE = 30;

// The conversation, newest at the bottom. Follows new rows while you're at the
// bottom and stays put while you read further up. Long conversations stay
// cheap: only the latest turns mount (older ones a click away), finished turns
// are folded and memoised, and off-screen turns skip layout (content-visibility).
export function ChatList({ turns, working, since, subagents, onInterrupt }: ChatListProps) {
  const { scrollRef, following, onScroll, jumpToLatest } = useFollowScroll(turns, working);
  const [limit, setLimit] = useState(PAGE);
  const hidden = Math.max(0, turns.length - limit);
  const shown = hidden > 0 ? turns.slice(hidden) : turns;

  const showEarlier = () => {
    const el = scrollRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    setLimit((l) => l + PAGE);
    // Keep the turn you were reading where it was once the older ones mount.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - fromBottom;
    });
  };

  return (
    <div className="tx-wrap">
      <div className="tx-scroll ac-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={-1}>
        <div className="tx-col ac-col">
          {hidden > 0 && (
            <button type="button" className="btn ghost ac-earlier" onClick={showEarlier}>
              Show {Math.min(PAGE, hidden)} earlier {hidden === 1 ? "turn" : "turns"}
            </button>
          )}
          {shown.map((turn) => (
            <TurnView key={turn.id} turn={turn} />
          ))}
          {working && <WorkingRow since={since} subagents={subagents} onInterrupt={onInterrupt} />}
        </div>
      </div>
      {!following && (
        <button type="button" className="btn tx-latest" onClick={jumpToLatest}>
          <I.Download size={13} /> Latest
        </button>
      )}
    </div>
  );
}
