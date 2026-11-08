import { useEffect } from "react";
import { create } from "zustand";
import type { PanelDescriptor } from "./types";

// The one rule for a workspace's tabs that come and go (Plan, Browser, Gallery,
// Files, Terminal, Tests, Pull request): see .claude/rules/tabs.md.
//
// - It shows while it has content.
// - Its × hides it. Nothing is deleted: the content stays, and the pane menu's Tabs
//   list marks it as having some.
// - New content brings it back by itself. "New" is a change in the tab's
//   `signature` (a new document, page, set, change count, run, PR), not any update.
// - Picked from the menu it shows again; one that can open empty (`opensEmpty`)
//   also shows with nothing in it, until its × or its first content.

/** What the user did with one workspace's tab. */
export interface ComingEntry {
  /** Opened from the pane menu: shown whatever it holds. */
  revealed?: boolean;
  /** Hidden by its ×, while its content had this signature. */
  dismissed?: string;
}

export interface ComingView {
  visible: boolean;
  /** Shown with nothing in it (opened empty). */
  peeking: boolean;
}

/** The rule itself: whether the tab shows, given its content and what the user did. */
export function comingView(content: boolean, signature: string, e: ComingEntry): ComingView {
  return {
    visible: e.revealed === true || (content && e.dismissed !== signature),
    peeking: e.revealed === true && !content,
  };
}

const key = (tab: string, ws: string) => `${tab}:${ws}`;

interface ComingStore {
  entries: Record<string, ComingEntry>;
  set: (k: string, entry: ComingEntry) => void;
}

const useComingStore = create<ComingStore>((set) => ({
  entries: {},
  set: (k, entry) => set((s) => ({ entries: { ...s.entries, [k]: entry } })),
}));

/** A tab that comes and goes, as its descriptor needs it. */
export interface Coming extends ComingView {
  /** It has content (the menu's filled mark). */
  content: boolean;
  /** Show it: undo a ×, or open it empty. */
  reveal: () => void;
  /** Its ×: hide it until new content arrives. */
  close: () => void;
}

/**
 * Tab `tab` of workspace `ws` under the rule: `content` says whether it has any, and
 * `signature` changes only when new content arrives (it brings a hidden tab back).
 */
export function useComing(tab: string, ws: string, content: boolean, signature: string): Coming {
  const k = key(tab, ws);
  const entry = useComingStore((s) => s.entries[k]) ?? {};
  // Content landing in a tab opened empty makes it an ordinary tab again: the menu's
  // pick is spent, so it goes when its content does.
  useEffect(() => {
    if (content && entry.revealed) useComingStore.getState().set(k, {});
  }, [k, content, entry.revealed]);
  const put = (next: ComingEntry) => useComingStore.getState().set(k, next);
  return {
    ...comingView(content, signature, entry),
    content,
    reveal: () => put({ revealed: true }),
    close: () => put(content ? { dismissed: signature } : {}),
  };
}

/**
 * The descriptor fields every coming tab shares: hidden by the rule, a × whenever
 * it shows, revealed from the menu. `opensEmpty`: it can show with nothing in it
 * (a shell, a blank page); otherwise the menu can't pick it while it's empty.
 */
export function comingFields(c: Coming, opensEmpty: boolean): Partial<PanelDescriptor> {
  return {
    comes: true,
    filled: c.content,
    opensEmpty,
    hidden: !c.visible,
    onReveal: c.reveal,
    onClose: c.visible ? c.close : undefined,
  };
}

import.meta.hot?.accept(() => location.reload());
