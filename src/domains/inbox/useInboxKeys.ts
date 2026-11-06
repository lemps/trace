import { useEffect, useRef } from "react";
import { isTyping, overlayOpen } from "@/domains/agent/useDetailKeys";
import { useBoardStore } from "@/domains/board/store";
import { useSessionsStore } from "@/domains/sessions/store";
import { isShortcut, shortcutIndex } from "@/platform/shortcuts";

export interface InboxKeyActions {
  move: (by: -1 | 1) => void;
  nudge: (by: -1 | 1) => void;
  open: () => void;
  dismiss: () => void;
  /** 1–9: pick that answer on the selected agent's prompt. */
  answer: (index: number) => void;
}

/** Whether focus is in the list (or nowhere). */
function inList(target: EventTarget | null): boolean {
  return (
    target === document.body ||
    (target instanceof HTMLElement && target.closest(".ib-list") !== null)
  );
}

/**
 * The inbox's keyboard, as bound in Settings → Shortcuts: by default J/K (or ↑/↓ in the
 * list) move, ⌥↑/⌥↓ reorder, ⏎ opens, E dismisses, 1–9 answer. Inactive while typing,
 * while a modal or menu is up, and while a detail overlay covers the inbox.
 */
export function useInboxKeys(actions: InboxKeyActions): void {
  // A ref so the listener is registered once but always calls the latest actions.
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      if (overlayOpen()) return;
      if (useBoardStore.getState().selectedIssueKey || useSessionsStore.getState().selectedId) {
        return;
      }
      const a = ref.current;
      // Arrows belong to the list only when it (or nothing) has focus — else they scroll.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!inList(e.target)) return;
      }
      // A focused button (an answer, a tab) keeps Enter, Space and the numbers, whatever
      // they're bound to. Rows are divs.
      if (e.target instanceof HTMLButtonElement && /^(Enter| |[0-9])$/.test(e.key)) return;
      const answer = shortcutIndex("inboxAnswer", e);
      if (isShortcut("inboxMoveDown", e)) a.nudge(1);
      else if (isShortcut("inboxMoveUp", e)) a.nudge(-1);
      else if (isShortcut("inboxNext", e)) a.move(1);
      else if (isShortcut("inboxPrev", e)) a.move(-1);
      else if (isShortcut("inboxOpen", e)) a.open();
      else if (isShortcut("inboxDismiss", e)) a.dismiss();
      else if (answer !== null) a.answer(answer);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
