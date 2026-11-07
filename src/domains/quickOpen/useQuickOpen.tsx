import { type ReactNode, useEffect, useRef } from "react";
import { overlayOpen } from "@/domains/agent/useDetailKeys";
import { isQuickOpenKey } from "@/platform/shortcuts";
import { QuickOpen } from "./QuickOpen";
import { useQuickOpenStore } from "./store";

/**
 * Quick Open for a detail view: its shortcut (or the Files tab's button) opens the
 * picker over `workspaceId`'s worktree, and a pick is revealed in the Files tab, which
 * `showFiles` switches to. Returns the picker to render (null while closed).
 * `enabled` is false where there's no worktree to search (a plain-folder session).
 */
export function useQuickOpen(
  workspaceId: string,
  enabled: boolean,
  showFiles: () => void
): ReactNode {
  const isOpen = useQuickOpenStore((s) => s.openFor === workspaceId);
  const showRef = useRef(showFiles);
  showRef.current = showFiles;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // A focused terminal hands this chord over (it's an app key), so it works there too.
      if (e.defaultPrevented || !isQuickOpenKey(e) || overlayOpen()) return;
      e.preventDefault();
      useQuickOpenStore.getState().show(workspaceId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, workspaceId]);

  // Leaving the view closes its picker.
  useEffect(() => () => useQuickOpenStore.getState().hide(), []);

  if (!isOpen || !enabled) return null;
  return (
    <QuickOpen
      workspaceId={workspaceId}
      onClose={() => useQuickOpenStore.getState().hide()}
      onView={(path) => {
        useQuickOpenStore.getState().reveal(workspaceId, path);
        showRef.current();
      }}
    />
  );
}
