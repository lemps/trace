import { useEffect } from "react";
import { useBoardStore } from "@/domains/board/store";
import { consumeNotificationClick } from "@/ipc/notify";
import type { NavId } from "./nav";
import { openWorkspace } from "./openWorkspace";

/** What the app does when its window regains focus. */
export function useFocusRefresh(setNav: (nav: NavId) => void): void {
  const refreshAllPrs = useBoardStore((s) => s.refreshAllPrs);
  useEffect(() => {
    let lastPrRefresh = 0;
    const onFocus = () => {
      // A focus right after a waiting notification ≈ the user clicked it:
      // jump straight to that workspace's detail (issue card or session).
      const target = consumeNotificationClick();
      if (target) openWorkspace(target, setNav);
      // PR statuses change outside the app (agents run gh; merges happen in
      // the browser) — re-check on focus, at most once a minute.
      if (Date.now() - lastPrRefresh >= 60_000) {
        lastPrRefresh = Date.now();
        refreshAllPrs();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshAllPrs, setNav]);
}
