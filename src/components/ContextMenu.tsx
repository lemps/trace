import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "@/hooks/useDismiss";
import { MenuList } from "./MenuList";
import type { MenuSection } from "./PopMenu";

interface ContextMenuProps {
  /** Where the pointer was (client coordinates). */
  x: number;
  y: number;
  sections: MenuSection[];
  onClose: () => void;
  /**
   * Where focus goes after Escape or a pick (before the item runs). Defaults to what
   * had focus when it opened; a terminal passes its xterm, so keys keep reaching it.
   */
  returnFocus?: () => void;
}

// PopMenu's body (`MenuList`), opened at the pointer by a right-click (or the
// context-menu key, `useContextMenuAt`) instead of under a trigger. Kept inside the
// window; takes focus so arrows move through it and Esc closes it — which also keeps
// Esc from reaching a terminal under it, where it would interrupt the agent.
export function ContextMenu({ x, y, sections, onClose, returnFocus }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, true, close);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const left = Math.max(4, Math.min(x, window.innerWidth - el.offsetWidth - 4));
    const top = Math.max(4, Math.min(y, window.innerHeight - el.offsetHeight - 4));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [pos]);

  const closeAndReturn = () => {
    onClose();
    if (returnFocus) returnFocus();
    else if (opener?.isConnected) opener.focus();
  };

  // On the body: a transformed ancestor (a detail's entrance) would offset `fixed`.
  return createPortal(
    <MenuList
      ref={ref}
      className="ctx-menu"
      style={pos ?? { visibility: "hidden", left: x, top: y }}
      sections={sections}
      onClose={closeAndReturn}
    />,
    document.body
  );
}
