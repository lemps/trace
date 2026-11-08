import { type MouseEvent, useCallback, useState } from "react";

// Where a right-click menu (`ContextMenu`) is open, and on what. The context-menu key
// (or Shift+F10) reports no pointer, so the menu opens under the element instead.

export interface ContextMenuAt<T> {
  target: T;
  x: number;
  y: number;
}

export interface UseContextMenuAt<T> {
  menu: ContextMenuAt<T> | null;
  /** An `onContextMenu` handler opening the menu for `target`. */
  openAt: (target: T) => (e: MouseEvent<HTMLElement>) => void;
  close: () => void;
}

export function useContextMenuAt<T>(): UseContextMenuAt<T> {
  const [menu, setMenu] = useState<ContextMenuAt<T> | null>(null);
  const openAt = useCallback(
    (target: T) => (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      const keyboard = e.clientX === 0 && e.clientY === 0;
      setMenu({ target, x: keyboard ? r.left : e.clientX, y: keyboard ? r.bottom : e.clientY });
    },
    []
  );
  const close = useCallback(() => setMenu(null), []);
  return { menu, openAt, close };
}
