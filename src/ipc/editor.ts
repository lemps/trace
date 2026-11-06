import { invoke } from "@tauri-apps/api/core";

export type Editor = "vscode" | "intellij" | "cursor";

/**
 * Open the issue's worktree (or repo root) in a desktop editor — or, with `file`,
 * just that file (absolute, or relative to the workspace).
 */
export function openInEditor(issueKey: string, editor: Editor, file?: string): Promise<void> {
  return invoke("open_in_editor", { issueKey, editor, file: file ?? null });
}
