import { useLayoutEffect, useRef, useState } from "react";
import { I } from "@/components/Icon";
import type { ChatTurn } from "./projection";
import { WorkingRow } from "./TurnBits";
import { TurnView } from "./TurnView";

interface ChatListProps {
  turns: ChatTurn[];
  working: boolean;
  /** When the running turn started (unix ms), for the working timer. */
  since: number | null;
}

/** Within this many px of the bottom counts as "following along". */
const STICK_PX = 48;
/** Turns drawn at first, and added per "Show earlier". */
const PAGE = 30;

// The conversation, newest at the bottom. Follows new rows while you're at the
// bottom and stays put while you read further up. Long conversations stay
// cheap: only the latest turns mount (older ones a click away), finished turns
// are folded and memoised, and off-screen turns skip layout (content-visibility).
export function ChatList({ turns, working, since }: ChatListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const hidden = Math.max(0, turns.length - limit);
  const shown = hidden > 0 ? turns.slice(hidden) : turns;

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run whenever the turns change
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [turns, working]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
    followingRef.current = near;
    setFollowing(near);
  };
  const showEarlier = () => {
    const el = scrollRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    setLimit((l) => l + PAGE);
    // Keep the turn you were reading where it was once the older ones mount.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - fromBottom;
    });
  };
  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
          {working && <WorkingRow since={since} />}
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
