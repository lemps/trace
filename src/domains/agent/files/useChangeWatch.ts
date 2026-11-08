import { useEffect, useRef, useState } from "react";
import { useAgentLight } from "@/domains/live/store";
import { gitDiffSummary, ownChanges } from "@/ipc/diff";
import { useWorkspaceTabsStore } from "../workspaceTabsStore";

/** The least time between two re-reads caused by the window regaining focus. */
const FOCUS_REFRESH_MS = 15_000;

/**
 * Keep `ws`'s changed-file count fresh while `enabled` — the Files tab is hidden,
 * so nothing else is reading it. Read on start, when its agent finishes a turn
 * (edits land then) and when the window regains focus (edits made in an editor),
 * like the Files tab itself. Shown, the tab's own reads (`useFilesData`) keep the
 * count, so git isn't asked twice.
 */
export function useChangeWatch(ws: string, enabled: boolean): void {
  const [tick, setTick] = useState(0);
  const light = useAgentLight(ws);
  const wasWorking = useRef(light === "working");
  useEffect(() => {
    if (wasWorking.current && light !== "working") setTick((t) => t + 1);
    wasWorking.current = light === "working";
  }, [light]);

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < FOCUS_REFRESH_MS) return;
      last = Date.now();
      setTick((t) => t + 1);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the re-read trigger
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    gitDiffSummary(ws)
      .then((s) => {
        if (!cancelled) useWorkspaceTabsStore.getState().setChanges(ws, ownChanges(s));
      })
      // No repo to read (none set up, or a plain folder): nothing changed.
      .catch(() => {
        if (!cancelled) useWorkspaceTabsStore.getState().setChanges(ws, 0);
      });
    return () => {
      cancelled = true;
    };
  }, [ws, enabled, tick]);
}
