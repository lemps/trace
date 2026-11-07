import { invoke } from "@tauri-apps/api/core";

/** How a path differs from the base. `untracked` is new and not yet known to git. */
export type ChangeKind = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface FileSummary {
  /** Where the file is now, relative to the worktree with `/` separators. */
  path: string;
  add: number;
  del: number;
  status: ChangeKind;
  /** A renamed file's path in the base. */
  oldPath?: string;
}

export interface DiffSummary {
  /** The ref we diffed against, e.g. `origin/main`. */
  base: string;
  files: FileSummary[];
}

export interface DiffLine {
  /** "ctx" (context) | "add" | "del" */
  kind: "ctx" | "add" | "del";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  add: number;
  del: number;
  hunks: Hunk[];
}

export function gitDiffSummary(issueKey: string): Promise<DiffSummary> {
  return invoke("git_diff_summary", { issueKey });
}

/** One file's diff; `oldPath` pairs a renamed file with its path in the base. */
export function gitDiffFile(issueKey: string, path: string, oldPath?: string): Promise<FileDiff> {
  return invoke("git_diff_file", { issueKey, path, oldPath: oldPath ?? null });
}

/** A worktree file's current text content (for the markdown preview). */
export function readWorkspaceFile(issueKey: string, path: string): Promise<string> {
  return invoke("read_workspace_file", { issueKey, path });
}
