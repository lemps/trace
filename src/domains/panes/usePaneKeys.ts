import { useEffect, useRef } from "react";
import { overlayOpen } from "@/domains/agent/useDetailKeys";
import { isShortcut } from "@/platform/shortcuts";
import { cycleFocus, focusedGroup, moveToNextGroup, type PaneLayout, splitTab } from "./model";
import type { Panes } from "./usePanes";

type Op = (l: PaneLayout) => PaneLayout;

/** The keys and what each does to the layout, acting on the focused pane's shown tab. */
const KEYS: [string, Op][] = [
  ["paneSplitRight", (l) => splitTab(l, focusedGroup(l).active, focusedGroup(l).id, "right")],
  ["paneSplitDown", (l) => splitTab(l, focusedGroup(l).active, focusedGroup(l).id, "bottom")],
  ["paneFocusNext", (l) => cycleFocus(l, 1)],
  ["paneFocusPrev", (l) => cycleFocus(l, -1)],
  ["paneMoveTab", (l) => moveToNextGroup(l, focusedGroup(l).active)],
];

/**
 * A pane area's keys (Settings → Shortcuts, "Agent and ticket views"): split the
 * shown tab off right or down, move it on, and step focus between panes — focus
 * lands inside the pane, so typing goes where you looked. Off in the narrow fallback,
 * where there's one row to act on. They reach here from a focused terminal too
 * (`isAppKey`).
 */
export function usePaneKeys(panes: Panes, narrow: boolean, focusLater: () => void): void {
  const ref = useRef({ panes, narrow, focusLater });
  ref.current = { panes, narrow, focusLater };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || overlayOpen()) return;
      const hit = KEYS.find(([id]) => isShortcut(id, e));
      if (!hit) return;
      const { panes, narrow, focusLater } = ref.current;
      e.preventDefault();
      if (narrow) return;
      panes.apply(hit[1]);
      focusLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
