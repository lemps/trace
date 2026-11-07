//! Diff commands. Show the agent's worktree changes vs the repo's
//! `origin/<default-branch>`: a change list for the file tree, plus per-file
//! unified diffs parsed into hunks for the diff viewer. The work is in
//! `worktree_diff`; these are the thin, off-main-thread wrappers.

use crate::diff_parse::FileDiff;
use crate::workspace_dir::work_dir_for;
use crate::worktree_diff::{self, DiffSummary};

/// Read a worktree file's current content (working-tree version, including
/// uncommitted edits) for the Files tab's markdown preview. Rejects path
/// traversal, oversized files, and binaries so a stray click can't wedge the
/// renderer.
#[tauri::command]
pub fn read_workspace_file(issue_key: String, path: String) -> Result<String, String> {
    const MAX_BYTES: usize = 1024 * 1024; // 1 MiB — generous for any document
    let (_repo, worktree) = work_dir_for(&issue_key)?;
    // The path comes from the diff summary (relative, inside the worktree), but
    // guard anyway — never let it escape.
    let rel = crate::helpers::safe_relative_path(&path)?;
    let full = std::path::Path::new(&worktree).join(rel);
    let bytes = std::fs::read(&full).map_err(|e| format!("Couldn't read {path}: {e}"))?;
    if bytes.len() > MAX_BYTES {
        return Err("File is too large to preview.".to_string());
    }
    if bytes.contains(&0) {
        return Err("Not a text file.".to_string());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// File-list summary for the diff/Files views and the Recents diff stats.
///
/// Async + spawn_blocking is essential: a synchronous command runs on Tauri's
/// main thread, so a burst of these (the Recents sidebar fetches one per
/// worktree session) would freeze the UI while git ran. Off-thread, it doesn't.
#[tauri::command]
pub async fn git_diff_summary(issue_key: String) -> Result<DiffSummary, String> {
    tauri::async_runtime::spawn_blocking(move || worktree_diff::summary(&issue_key))
        .await
        .map_err(|e| format!("diff summary task failed: {e}"))?
}

/// Per-file unified diff parsed into hunks for the diff viewer. `old_path` is a
/// renamed file's path in the base, so the diff pairs the two instead of showing
/// the new path as wholly added. Off the main thread, like the summary: a big
/// file's diff takes git a moment.
#[tauri::command]
pub async fn git_diff_file(
    issue_key: String,
    path: String,
    old_path: Option<String>,
) -> Result<FileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        worktree_diff::file_diff(&issue_key, &path, old_path.as_deref())
    })
    .await
    .map_err(|e| format!("diff task failed: {e}"))?
}
