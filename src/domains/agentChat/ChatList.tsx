import { useState } from "react";
import { useChatView } from "./chatContext";
import { useFollowScroll } from "./hooks/useFollowScroll";
import { LatestButton } from "./LatestButton";
import type { ChatTurn } from "./projection";
import { WorkingRow } from "./TurnBits";
import { TurnView } from "./TurnView";

interface ChatListProps {
  turns: ChatTurn[];
  /**
   * Draw the Working row: a turn runs, or subagents still work after theirs, and
   * no prompt waits on you (`waiting.ts`).
   */
  working: boolean;
  /** When the running turn started (unix ms), for the working timer; null between turns. */
  since: number | null;
  /** Subagents still running. */
  subagents: number;
}

/** Turns drawn at first, and added per "Show earlier". */
const PAGE = 30;

// How many turns each chat had drawn, so one that comes back (its tab was hidden,
// which unmounts it) still holds the earlier turn you were reading.
const drawn = new Map<string, number>();

// The conversation, newest at the bottom. Follows new rows while you're at the
// bottom and stays put while you read further up. Long conversations stay
// cheap: only the latest turns mount (older ones a click away), finished turns
// are folded and memoised, and off-screen turns skip layout (content-visibility).
export function ChatList({ turns, working, since, subagents }: ChatListProps) {
  const { workspaceId } = useChatView();
  const { scrollRef, following, onScroll, jumpToLatest } = useFollowScroll(
    turns,
    working,
    `chat:${workspaceId}`
  );
  const [limit, setLimit] = useState(() => drawn.get(workspaceId) ?? PAGE);
  const hidden = Math.max(0, turns.length - limit);
  const shown = hidden > 0 ? turns.slice(hidden) : turns;

  const showEarlier = () => {
    const el = scrollRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    setLimit((l) => {
      drawn.set(workspaceId, l + PAGE);
      return l + PAGE;
    });
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
          {working && <WorkingRow since={since} subagents={subagents} />}
        </div>
      </div>
      <LatestButton scrollRef={scrollRef} show={!following} onJump={jumpToLatest} />
    </div>
  );
}

// A hot update would leave the lists on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
