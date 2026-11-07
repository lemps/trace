import type { Os } from "./os";

// Paths reach the UI with either separator: Windows dialogs give `C:\repo`, git gives
// `C:/repo`. A backslash in a Unix file name is rare enough not to design around here,
// where paths are only ever shown.

/** The last component of a path, for display. */
export function basename(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .pop() || path
  );
}

/** `path` with forward slashes, for comparing paths that came from different places. */
export function forwardSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * A path inside a worktree in git's form (`src/a.ts`). On Windows `\` is a separator
 * and becomes `/`; elsewhere it's a legal file name character and stays.
 */
export function worktreeRelative(path: string, os: Os): string {
  return os === "windows" ? forwardSlashes(path) : path;
}

/**
 * `rel` (git's `/` form) under the folder `root`, written the way the OS writes paths:
 * backslashes on Windows, for Explorer and for a path pasted into a Windows tool.
 */
export function joinNative(root: string, rel: string, os: Os): string {
  const joined = `${root.replace(/[\\/]+$/, "")}/${rel.replace(/^[\\/]+/, "")}`;
  return os === "windows" ? joined.replace(/\//g, "\\") : joined;
}
