import { useEffect } from "react";
import { isTyping, overlayOpen } from "@/domains/agent/useDetailKeys";
import { isSearchKey, isShortcut } from "@/platform/shortcuts";
import { useCheatSheet } from "./store";

/**
 * The cheat sheet's keys, app-wide: `?` when you aren't typing, and its chord
 * (Ctrl+/ by default) from anywhere but a terminal, which keeps its own keys.
 * Pressed again they close it; Esc does too (it's a `Modal`).
 */
export function useCheatSheetKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(".xterm")) return;
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey;
      const typed = bare && e.key === "?";
      // Ctrl+Shift+/ is the search's; a binding written without Shift still hears it.
      const chord = isShortcut("cheatSheet", e) && !isSearchKey(e);
      if (!typed && !chord) return;
      if (bare && isTyping(target)) return;
      const { open, toggle } = useCheatSheet.getState();
      // Another modal or a menu owns the keys while it's up.
      if (!open && overlayOpen()) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
