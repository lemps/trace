import { type MouseEvent, type RefObject, useCallback, useRef, useState } from "react";
import type { I } from "./Icon";
import type { MenuItem } from "./PopMenu";

// One list of a row's actions (trace-ui §5): its ⋯ and its right-click menu show all
// of them, and its hover bar the few marked `inBar`, drawn with their glyphs. Used by
// session rows, board cards, and the Fleet and Inbox rows.

/** A glyph from `I`, for the hover bar only: menus are text-only. */
export type Glyph = (typeof I)[keyof typeof I];

export interface RowAction extends MenuItem {
  id: string;
  /** A word or two: the menu item, and the hover-bar button's name and tooltip. */
  label: string;
  /** Its glyph in the hover bar (§4's table). */
  glyph?: Glyph;
  /** One of the row's 2–4 frequent actions, shown in its hover bar as well. */
  inBar?: boolean;
  /** A shortcut id (`platform/shortcuts`), named in the bar button's tooltip. */
  shortcut?: string;
}

/** A menu section; shared builders' plain items (`editorItems`) go in as they are. */
export interface RowActionSection {
  title?: string;
  items: (RowAction | MenuItem)[];
}

const inBar = (a: RowAction | MenuItem): a is RowAction =>
  "inBar" in a && a.inBar === true && a.glyph !== undefined;

/** The hover bar's actions: the `inBar` ones that have a glyph, in list order. */
export function barActions(sections: RowActionSection[]): RowAction[] {
  return sections.flatMap((s) => s.items).filter(inBar);
}

/** An item by id, for a row that draws one of them its own way (a card's Start). */
export function findAction(sections: RowActionSection[], id: string): MenuItem | undefined {
  return sections.flatMap((s) => s.items).find((a) => a.id === id);
}

interface MenuAt {
  x: number;
  y: number;
  /** Opened from the ⋯ (so it reads `aria-expanded`, and focus goes back to it). */
  fromMore: boolean;
}

export interface RowMenu {
  at: MenuAt | null;
  /** The row's `onContextMenu`: at the pointer, or under the row from the menu key. */
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
  /** The ⋯: opens the menu under itself, or closes it. */
  toggleMore: () => void;
  /** The ⋯'s slot, which the menu opens under. */
  moreRef: RefObject<HTMLSpanElement | null>;
  close: () => void;
}

/**
 * Where a row's menu is open. Both ways in open the same `ContextMenu`, laid on the
 * body, so it isn't clipped by a scrolling list (a board column) and its clicks never
 * reach the row (which would open it) or start the row's drag.
 */
export function useRowMenu(): RowMenu {
  const [at, setAt] = useState<MenuAt | null>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const onContextMenu = useCallback((e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    // The context-menu key (or Shift+F10) reports no pointer.
    const keyboard = e.clientX === 0 && e.clientY === 0;
    setAt({
      x: keyboard ? r.left : e.clientX,
      y: keyboard ? r.bottom : e.clientY,
      fromMore: false,
    });
  }, []);
  const toggleMore = useCallback(() => {
    const r = moreRef.current?.getBoundingClientRect();
    setAt((cur) => (cur?.fromMore || !r ? null : { x: r.right, y: r.bottom + 4, fromMore: true }));
  }, []);
  const close = useCallback(() => setAt(null), []);
  return { at, onContextMenu, toggleMore, moreRef, close };
}
