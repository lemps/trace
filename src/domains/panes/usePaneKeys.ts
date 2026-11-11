import { useEffect, useRef } from "react";
import { isTyping, overlayOpen } from "@/domains/agent/useDetailKeys";
import { isShortcut } from "@/platform/shortcuts";
import { cycleFocus, focusedGroup, moveToNextGroup, type PaneLayout, splitTab } from "./model";
import { stepOrigin, stepRun, upFrom } from "./owned";
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
 * (`isAppKey`). The next/previous-tab keys step through the agent in view and its
 * subagents' tabs (`owned.ts`), the narrow fallback included, and Esc on a
 * subagent's tab goes up to its agent's.
 */
export function usePaneKeys(panes: Panes, narrow: boolean, focusLater: () => void): void {
  const ref = useRef({ panes, narrow, focusLater });
  ref.current = { panes, narrow, focusLater };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || overlayOpen()) return;
      // Through an agent's tab and its subagents' tabs, in the strips' order.
      const step = isShortcut("chatNextTab", e) ? 1 : isShortcut("chatPrevTab", e) ? -1 : 0;
      if (step !== 0) {
        const { panes } = ref.current;
        const from = stepOrigin(panes.layout, panes.runs);
        const to = from ? stepRun(panes.layout, panes.runs, from, step) : null;
        if (!to) return;
        e.preventDefault();
        panes.select(to);
        return;
      }
      // Esc on a subagent's tab goes up to its agent's tab, as its breadcrumb does,
      // not out of the detail (which is what Esc does next, from the agent's tab).
      if (isShortcut("detailBack", e) && !isTyping(e.target)) {
        const { panes } = ref.current;
        const up = upFrom(panes.layout, panes.runs);
        if (!up) return;
        e.preventDefault();
        panes.select(up);
        return;
      }
      const hit = KEYS.find(([id]) => isShortcut(id, e));
      if (!hit) return;
      const { panes, narrow, focusLater } = ref.current;
      e.preventDefault();
      if (narrow) return;
      panes.apply(hit[1]);
      focusLater();
    };
    // Capturing: it's heard before the detail's own Esc (`useDetailKeys`), which
    // stands down for a key already handled.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
