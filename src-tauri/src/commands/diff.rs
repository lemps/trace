//! Diff commands. Show the agent's worktree changes vs the repo's
//! `origin/<default-branch>`: a numstat summary for the file tree, plus
//! per-file unified diffs parsed into hunks for the diff viewer.

use serde::Serialize;

use crate::diff_parse::{parse_unified, FileDiff};
use crate::diff_summary::{parse_raw_numstat, ChangeKind, FileSummary};
use crate::git;
use crate::workspace_dir::work_dir_for;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    /// The ref we diffed against, e.g. `origin/main`.
    pub base: String,
    pub files: Vec<FileSummary>,
}

fn base_ref(repo: &str) -> String {
    format!("origin/{}", git::get_default_branch(repo))
}

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

/// The commit to diff against: the merge-base of the workspace and the default
/// branch — "what changed since this branch forked". Diffing `origin/main`
/// directly (two-dot) would show upstream commits the worktree lacks as
/// phantom deletions. Falls back to the branch ref if merge-base fails
/// (e.g. unborn HEAD).
fn diff_base(work_dir: &str, base: &str) -> String {
    let out = crate::claude::discovery::command("git")
        .args(["merge-base", base, "HEAD"])
        .current_dir(work_dir)
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let sha = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if sha.is_empty() {
                base.to_string()
            } else {
                sha
            }
        }
        _ => base.to_string(),
    }
}

/// Paths git doesn't track yet — exactly what an agent's brand-new files are
/// until something commits them. `git diff` never reports these. `-z` keeps
/// names verbatim (no C-quoting of spaces or non-ASCII); `pathspec` narrows it
/// to the given paths (all of them when empty).
fn untracked_files(work_dir: &str, pathspec: &[&str]) -> Vec<String> {
    crate::claude::discovery::command("git")
        .args(["ls-files", "-z", "--others", "--exclude-standard", "--"])
        .args(pathspec)
        .current_dir(work_dir)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            o.stdout
                .split(|b| *b == 0)
                .filter(|p| !p.is_empty())
                .map(|p| String::from_utf8_lossy(p).into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Added-line count for an untracked file (0 for binary/unreadable content),
/// mirroring what numstat would say once the file is tracked.
fn untracked_line_count(work_dir: &str, path: &str) -> u32 {
    let full = std::path::Path::new(work_dir).join(path);
    match std::fs::read(&full) {
        Ok(bytes) if !bytes.contains(&0) => String::from_utf8_lossy(&bytes).lines().count() as u32,
        _ => 0,
    }
}

/// File-list summary (blocking): every path that differs from the base, with
/// line counts. Includes committed and uncommitted changes in the worktree.
fn diff_summary_blocking(issue_key: &str) -> Result<DiffSummary, String> {
    let (repo, worktree) = work_dir_for(issue_key)?;
    let base = base_ref(&repo);
    let against = diff_base(&worktree, &base);
    // `--raw` adds each path's status to numstat's counts; `-z` keeps paths verbatim
    // (renames as two plain paths); `-M` finds renames whatever `diff.renames` says.
    let out = crate::claude::discovery::command("git")
        .args(["diff", "--raw", "--numstat", "-z", "-M", &against])
        .current_dir(&worktree)
        .output()
        .map_err(|e| format!("git diff --numstat failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git diff failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let mut files = parse_raw_numstat(&out.stdout);
    // New (untracked) files are the agent's most common output and `git diff`
    // can't see them — list them as pure additions.
    for path in untracked_files(&worktree, &[]) {
        let add = untracked_line_count(&worktree, &path);
        files.push(FileSummary {
            path,
            add,
            del: 0,
            status: ChangeKind::Untracked,
            old_path: None,
        });
    }
    Ok(DiffSummary { base, files })
}

/// File-list summary for the diff/Files views and the Recents diff stats.
///
/// Async + spawn_blocking is essential: a synchronous command runs on Tauri's
/// main thread, so a burst of these (the Recents sidebar fetches one per
/// worktree session) would freeze the UI while git ran. Off-thread, it doesn't.
#[tauri::command]
pub async fn git_diff_summary(issue_key: String) -> Result<DiffSummary, String> {
    tauri::async_runtime::spawn_blocking(move || diff_summary_blocking(&issue_key))
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
        diff_file_blocking(&issue_key, &path, old_path.as_deref())
    })
    .await
    .map_err(|e| format!("diff task failed: {e}"))?
}

fn diff_file_blocking(
    issue_key: &str,
    path: &str,
    old_path: Option<&str>,
) -> Result<FileDiff, String> {
    let (repo, worktree) = work_dir_for(issue_key)?;
    // `--no-index` below would happily read any file on disk.
    crate::helpers::safe_relative_path(path)?;
    if let Some(old) = old_path {
        crate::helpers::safe_relative_path(old)?;
    }

    // Untracked files have no base to diff against — synthesize the "all
    // added" diff with --no-index, which exits 1 when differences exist. Asked
    // as "is it untracked" rather than "is it in the index", so a staged
    // deletion (gone from both disk and index) still diffs against the base.
    let untracked = !untracked_files(&worktree, &[path]).is_empty();
    let out = if untracked {
        crate::claude::discovery::command("git")
            .args(["diff", "--no-color", "--no-index", "--", "/dev/null", path])
            .current_dir(&worktree)
            .output()
            .map_err(|e| format!("git diff failed to start: {e}"))?
    } else {
        let base = base_ref(&repo);
        let against = diff_base(&worktree, &base);
        let mut paths = vec![path];
        paths.extend(old_path);
        crate::claude::discovery::command("git")
            .args(["diff", "--no-color", "-M", &against, "--"])
            .args(&paths)
            .current_dir(&worktree)
            .output()
            .map_err(|e| format!("git diff failed to start: {e}"))?
    };
    // --no-index reports differences via exit code 1, so only treat >1 (or a
    // tracked-diff non-zero) with stderr content as failure.
    if !out.status.success() && (!untracked || out.status.code() != Some(1)) {
        return Err(format!(
            "git diff failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_unified(path, &text))
}
