import { create } from "zustand";

// What's open over each terminal: its find bar, and the menu a link click or a
// right-click raised. The registry (plain TS, no React) writes here from xterm's
// callbacks; `TerminalOverlay` renders it. Keyed like the registry (`term:<id>` for
// a shell, the workspace id for an agent).

/** A link the user pointed at in a terminal. */
export type LinkTarget =
  | { kind: "url"; url: string }
  | { kind: "file"; path: string; line?: number; col?: number };

/** A menu over the terminal, at a point in the window. */
export interface TerminalMenu {
  x: number;
  y: number;
  /** The link it's for; null for a right-click away from any link. */
  link: LinkTarget | null;
  /** A right-click: it also offers the terminal's own actions (Copy, Find…). */
  isContext: boolean;
}

interface TerminalUiStore {
  /** Terminals with the find bar open → how many times it was asked for (refocuses it). */
  find: Record<string, number>;
  menus: Record<string, TerminalMenu>;
  openFind: (key: string) => void;
  closeFind: (key: string) => void;
  openMenu: (key: string, menu: TerminalMenu) => void;
  closeMenu: (key: string) => void;
  /** Drop everything for a terminal that's gone. */
  forget: (key: string) => void;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

export const useTerminalUi = create<TerminalUiStore>((set) => ({
  find: {},
  menus: {},
  openFind: (key) => set((s) => ({ find: { ...s.find, [key]: (s.find[key] ?? 0) + 1 } })),
  closeFind: (key) => set((s) => ({ find: without(s.find, key) })),
  openMenu: (key, menu) => set((s) => ({ menus: { ...s.menus, [key]: menu } })),
  closeMenu: (key) => set((s) => ({ menus: without(s.menus, key) })),
  forget: (key) => set((s) => ({ find: without(s.find, key), menus: without(s.menus, key) })),
}));

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
