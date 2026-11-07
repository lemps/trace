import { type RefObject, useLayoutEffect, useState } from "react";
import { I } from "@/components/Icon";

/** Room the floating button needs beside the column's text (its width and a margin). */
const FLOAT_ROOM = 112;

interface LatestButtonProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The view isn't at the bottom. */
  show: boolean;
  onJump: () => void;
}

// "Latest", for when you've scrolled up. It never covers the conversation: it
// floats in the bottom-right corner while the column leaves room beside it (a wide
// pane), and otherwise takes a row of its own under the conversation.
export function LatestButton({ scrollRef, show, onJump }: LatestButtonProps) {
  const docked = useDocked(scrollRef);
  if (!show) return null;
  return (
    <div className={`ac-latest${docked ? " docked" : ""}`}>
      <button type="button" className="btn" onClick={onJump}>
        <I.Download size={13} /> Latest
      </button>
    </div>
  );
}

/** Whether the column's right gutter is too narrow for the floating button. */
function useDocked(scrollRef: RefObject<HTMLDivElement | null>): boolean {
  const [docked, setDocked] = useState(false);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const col = el?.firstElementChild;
    if (!el || !(col instanceof HTMLElement)) return;
    const check = () => {
      // The column's text ends at its right padding; the gutter is beyond that.
      const pad = Number.parseFloat(getComputedStyle(col).paddingRight) || 0;
      const room = el.getBoundingClientRect().right - col.getBoundingClientRect().right + pad;
      setDocked(room < FLOAT_ROOM);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    ro.observe(col);
    return () => ro.disconnect();
  }, [scrollRef]);
  return docked;
}
