import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentLight } from "@/domains/live/store";
import { type DiffSummary, gitDiffSummary } from "@/ipc/diff";
import { listWorkspaceFiles, type WorktreeFiles } from "@/ipc/files";
import { effectiveMode, type FilesMode } from "./store";

export interface FilesData {
  /** The mode on screen: the chosen one, or the default for what loaded. */
  mode: FilesMode;
  summary: DiffSummary | null;
  summaryError: string | null;
  /** Every file (git's list); fetched only once All files is wanted. */
  all: WorktreeFiles | null;
  allError: string | null;
  refresh: () => void;
}

/** Load `fetch` into state on each `tick` while `enabled`, keeping the last result meanwhile. */
function useLoaded<T>(
  fetch: () => Promise<T>,
  tick: number,
  enabled: boolean
): [T | null, string | null] {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the refresh trigger
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch()
      .then((v) => {
        if (cancelled) return;
        setValue(v);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [fetch, tick, enabled]);
  return [value, error];
}

/**
 * The Files tab's data: the change summary (always) and the worktree's whole file
 * list (once All files shows — `chosen`, or the default when there are no changes). Both reload on `refresh`, when the agent finishes a turn
 * (its edits land then), and when the window comes back into focus (edits made in
 * an editor). A reload keeps showing the last result until the new one arrives.
 */
export function useFilesData(workspaceId: string, chosen: FilesMode | undefined): FilesData {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const summaryFetch = useCallback(() => gitDiffSummary(workspaceId), [workspaceId]);
  const allFetch = useCallback(() => listWorkspaceFiles(workspaceId), [workspaceId]);
  const [summary, summaryError] = useLoaded(summaryFetch, tick, true);
  const mode = effectiveMode(chosen, summary ? summary.files.length : null, summaryError !== null);
  const [all, allError] = useLoaded(allFetch, tick, mode === "all");

  const light = useAgentLight(workspaceId);
  const wasWorking = useRef(light === "working");
  useEffect(() => {
    if (wasWorking.current && light !== "working") refresh();
    wasWorking.current = light === "working";
  }, [light, refresh]);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { mode, summary, summaryError, all, allError, refresh };
}
