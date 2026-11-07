import { useEffect, useState } from "react";
import { type DiffSummary, type FileDiff, gitDiffFile } from "@/ipc/diff";

export interface FileDiffState {
  diff: FileDiff | null;
  error: string | null;
  loading: boolean;
}

/**
 * The open file's diff, re-read whenever the summary reloads (the agent may have
 * changed it since). `oldPath` pairs a renamed file with its old self. A failure
 * stays in this file's view: the rest of the tab keeps working.
 */
export function useFileDiff(
  workspaceId: string,
  path: string | null,
  oldPath: string | undefined,
  summary: DiffSummary | null
): FileDiffState {
  const [state, setState] = useState<FileDiffState>({ diff: null, error: null, loading: false });
  // biome-ignore lint/correctness/useExhaustiveDependencies: summary is a refresh trigger
  useEffect(() => {
    if (!path) {
      setState({ diff: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    // Keep showing this file's last diff while it reloads; a different file starts blank.
    setState((s) => ({
      diff: s.diff?.path === path ? s.diff : null,
      error: null,
      loading: true,
    }));
    gitDiffFile(workspaceId, path, oldPath)
      .then((diff) => {
        if (!cancelled) setState({ diff, error: null, loading: false });
      })
      .catch((e) => {
        if (!cancelled) setState({ diff: null, error: String(e), loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, path, oldPath, summary]);
  return state;
}
