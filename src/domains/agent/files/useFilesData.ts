import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentLight } from "@/domains/live/store";
import { type DiffSummary, gitDiffSummary, ownChanges } from "@/ipc/diff";
import { listWorkspaceFiles, type WorktreeFiles } from "@/ipc/files";
import { useWorkspaceTabsStore } from "../workspaceTabsStore";
import { effectiveMode, type FilesMode } from "./store";

/** The least time between two reloads caused by the window regaining focus. */
const FOCUS_REFRESH_MS = 15_000;

const sameSummary = (a: DiffSummary, b: DiffSummary) => JSON.stringify(a) === JSON.stringify(b);

function sameFiles(a: WorktreeFiles, b: WorktreeFiles): boolean {
  if (a.truncated !== b.truncated || a.files.length !== b.files.length) return false;
  for (let i = 0; i < a.files.length; i++) if (a.files[i] !== b.files[i]) return false;
  return true;
}

export interface FilesData {
  /** The mode on screen: the chosen one, or the default for what loaded. */
  mode: FilesMode;
  summary: DiffSummary | null;
  summaryError: string | null;
  /** Every file (git's list); fetched only once All files is wanted. */
  all: WorktreeFiles | null;
  allError: string | null;
  /** Counts reloads: what's shown from disk (the open file's diff) re-reads on it. */
  version: number;
  refresh: () => void;
}

/**
 * Load `fetch` into state on each `tick` while `enabled`, keeping the last result
 * meanwhile. A reload that `same` says matches the last result keeps the old object,
 * so nothing built from it (a 100k-path tree) is rebuilt for an unchanged list.
 */
function useLoaded<T>(
  fetch: () => Promise<T>,
  tick: number,
  enabled: boolean,
  same: (a: T, b: T) => boolean
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
        setValue((old) => (old !== null && same(old, v) ? old : v));
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
 * list (once All files shows: `chosen`, or the default when there are no changes;
 * or while the open file is not a change).
 * Both reload on `refresh`, when the agent finishes a turn (its edits land then),
 * and when the window comes back into focus (edits made in an editor). A reload keeps showing the last result until the new one arrives.
 */
export function useFilesData(
  workspaceId: string,
  chosen: FilesMode | undefined,
  selected: string | null
): FilesData {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const summaryFetch = useCallback(() => gitDiffSummary(workspaceId), [workspaceId]);
  const allFetch = useCallback(() => listWorkspaceFiles(workspaceId), [workspaceId]);
  const [summary, summaryError] = useLoaded(summaryFetch, tick, true, sameSummary);
  // The tab shows only with changes: what's read here keeps that up to date.
  useEffect(() => {
    if (summary) useWorkspaceTabsStore.getState().setChanges(workspaceId, ownChanges(summary));
  }, [workspaceId, summary]);
  const mode = effectiveMode(chosen, summary ? summary.files.length : null, summaryError !== null);
  // The whole list is also needed when the open file isn't a change, to tell
  // whether it's still there after a reload.
  const selectedIsOther =
    selected !== null && summary !== null && !summary.files.some((f) => f.path === selected);
  const [all, allError] = useLoaded(allFetch, tick, mode === "all" || selectedIsOther, sameFiles);

  const light = useAgentLight(workspaceId);
  const wasWorking = useRef(light === "working");
  useEffect(() => {
    if (wasWorking.current && light !== "working") refresh();
    wasWorking.current = light === "working";
  }, [light, refresh]);

  // Coming back to the window re-reads, at most once per FOCUS_REFRESH_MS: on a big
  // repo a reload is a few seconds of git, and focus flips back and forth a lot. A
  // focus inside that window still re-reads, once it has passed.
  useEffect(() => {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      timer = null;
      last = Date.now();
      refresh();
    };
    const onFocus = () => {
      if (timer) return;
      const wait = last + FOCUS_REFRESH_MS - Date.now();
      if (wait <= 0) run();
      else timer = setTimeout(run, wait);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  return { mode, summary, summaryError, all, allError, version: tick, refresh };
}
