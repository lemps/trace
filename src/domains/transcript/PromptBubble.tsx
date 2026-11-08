import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

// A message you sent, as a bubble on the right. A long one (a pasted brief,
// a big paste of logs) folds to its first lines with "Show more" under it,
// rather than scrolling inside a small box: the composer grows to most of
// the window, so what you sent can be as long. Shared by the chat and the
// transcript.

/** Taller than this, a bubble folds (about ten lines of body text). */
const FOLD_PX = 220;

interface PromptBubbleProps {
  children: ReactNode;
  /** A slash command, drawn in mono. */
  command?: boolean;
}

export function PromptBubble({ children, command = false }: PromptBubbleProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    // The body's full height, folded or not, against the fold.
    const check = () => setTall(el.scrollHeight > FOLD_PX + 24);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const folded = tall && !open;
  return (
    <div className="tx-prompt">
      <div className={`tx-bubble${command ? " tx-command" : ""}`}>
        <div ref={bodyRef} className={`tx-bubble-body${folded ? " folded" : ""}`}>
          {children}
        </div>
        {tall && (
          <button
            type="button"
            className="tx-bubble-more"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}
