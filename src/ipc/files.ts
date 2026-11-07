import { invoke } from "@tauri-apps/api/core";

/** A worktree's files, relative to its root with `/` separators. */
export interface WorktreeFiles {
  files: string[];
  /** The repo has more files than trace lists (the backend caps the list). */
  truncated: boolean;
}

/**
 * Every file in a workspace's worktree: tracked ones plus new files `.gitignore`
 * doesn't exclude (`git ls-files`). Feeds Quick Open.
 */
export async function listWorkspaceFiles(issueKey: string): Promise<WorktreeFiles> {
  const raw: unknown = await invoke("list_workspace_files", { issueKey });
  if (typeof raw !== "object" || raw === null) throw new Error("Unexpected file list");
  const { files, truncated } = raw as { files?: unknown; truncated?: unknown };
  if (!Array.isArray(files)) throw new Error("Unexpected file list");
  return {
    files: files.filter((f): f is string => typeof f === "string"),
    truncated: truncated === true,
  };
}
