import { type RefObject, useEffect, useRef } from "react";
import { isTyping, overlayOpen } from "@/domains/agent/useDetailKeys";
import { isShortcut } from "@/platform/shortcuts";
import { stepTab } from "../ChatTabs";
import type { SubagentSummary } from "./useChat";

interface ChatKeys {
  working: boolean;
  interrupt: () => void;
  subagents: readonly SubagentSummary[];
  tab: string;
  setTab: (tab: string) => void;
}

/**
 * A chat view's keys, wherever focus is while the view is on screen: Esc
 * interrupts the agent (its turn and subagents) and the tab shortcuts move
 * between the main chat and the subagents' tabs. Not from another text box (a
 * question's typed answer, a queued message being edited: Esc there leaves the
 * box), nor while a menu, modal or the slash menu is open (they own Esc).
 *
 * Listened for on the window in the capture phase, so it's heard before the
 * detail view's Esc-goes-back whichever mounted first; when it acts it stops
 * the key there.
 */
export function useChatKeys(pane: RefObject<HTMLDivElement | null>, keys: ChatKeys): void {
  const ref = useRef(keys);
  ref.current = keys;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = pane.current;
      // Hidden (another tab of the detail view): not this view's key.
      if (!el || e.defaultPrevented || el.offsetParent === null || overlayOpen()) return;
      const target = e.target instanceof Element ? e.target : null;
      // Another chat view on screen holds focus: its key, not ours.
      const focusedPane = target?.closest(".ac-pane");
      if (focusedPane && focusedPane !== el) return;
      const inComposer = target?.classList.contains("ac-input") ?? false;
      if (isTyping(target) && !inComposer) return;
      const { working, interrupt, subagents, tab, setTab } = ref.current;
      const step = isShortcut("chatNextTab", e) ? 1 : isShortcut("chatPrevTab", e) ? -1 : 0;
      if (step !== 0 && subagents.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setTab(stepTab(subagents, tab, step));
        return;
      }
      if (!working || !isShortcut("chatInterrupt", e)) return;
      if (el.querySelector(".ac-slash")) return;
      e.preventDefault();
      e.stopPropagation();
      interrupt();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pane]);
}
