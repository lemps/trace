//! Quick Open's file list: every file in a workspace's worktree.

use crate::worktree_files::{self, WorktreeFiles};

/// List the workspace's files (tracked + new, `.gitignore` respected) for Quick
/// Open. Runs off the main thread: `git ls-files` on a huge repo can take a moment.
#[tauri::command]
pub async fn list_workspace_files(issue_key: String) -> Result<WorktreeFiles, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_repo, work_dir) = crate::workspace_dir::work_dir_for(&issue_key)?;
        worktree_files::list(&work_dir)
    })
    .await
    .map_err(|e| format!("Couldn't list files: {e}"))?
}
