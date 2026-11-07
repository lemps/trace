//! Diff commands. Show the agent's worktree changes vs the repo's
//! `origin/<default-branch>`: a numstat summary for the file tree, plus
//! per-file unified diffs parsed into hunks for the diff viewer.

use serde::Serialize;

use crate::diff_parse::{parse_unified, FileDiff};
use crate::git;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileSummary {
    pub path: String,
    pub add: u32,
    pub del: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    /// The ref we diffed against, e.g. `origin/main`.
    pub base: String,
    pub files: Vec<FileSummary>,
}

/// Resolve `(repo, work_dir)` for a workspace's diff. Board agents have an
/// isolated worktree at `.worktrees/<slug>`; exploratory sessions run in the
/// repo root and have none, so we fall back to the repo itself. Returns
/// `(repo, work_dir)` where the diff is computed in `work_dir`.
pub(crate) fn work_dir_for(workspace_id: &str) -> Result<(String, String), String> {
    // A session in a plain folder has no repo. The fallback below would show the
    // diff of an unrelated default repo as if it were this session's.
    if let Some(session) = crate::commands::session::owning_session(workspace_id) {
        if session.folder.is_some() {
            return Err("This session runs in a plain folder, so it has no diff.".to_string());
        }
        // A session runs in its own repo (not the default one): its worktree once it
        // has started, the repo root before that.
        let cwd = crate::commands::session::session_cwd(&session.id, false)?;
        let repo = session
            .repo
            .or_else(crate::commands::repos::default_repo)
            .ok_or_else(|| "Choose a repository folder in Settings first.".to_string())?;
        return Ok((repo, cwd));
    }
    // Issues resolve to their assigned repo; sessions (and anything unassigned)
    // fall back to the default repo.
    let repo = crate::commands::repos::repo_for(workspace_id)
        .ok()
        .or_else(crate::commands::repos::default_repo)
        .ok_or_else(|| "Choose a repository folder in Settings first.".to_string())?;
    let worktree = crate::commands::repos::workspace_dir(&repo, workspace_id);
    if std::path::Path::new(&worktree).exists() {
        Ok((repo, worktree))
    } else {
        // No worktree → exploratory session working directly in the repo root.
        Ok((repo.clone(), repo))
    }
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
/// until something commits them. `git diff` never reports these.
fn untracked_files(work_dir: &str) -> Vec<String> {
    crate::claude::discovery::command("git")
        .args(["ls-files", "--others", "--exclude-standard"])
        .current_dir(work_dir)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter(|l| !l.is_empty())
                .map(str::to_string)
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
    let out = crate::claude::discovery::command("git")
        .args(["diff", "--numstat", &against])
        .current_dir(&worktree)
        .output()
        .map_err(|e| format!("git diff --numstat failed to start: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "git diff failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut files = Vec::new();
    for line in text.lines() {
        // numstat is "<add>\t<del>\t<path>"; binary files emit "-\t-\t<path>".
        let mut it = line.splitn(3, '\t');
        let add_s = it.next().unwrap_or("0");
        let del_s = it.next().unwrap_or("0");
        let path = match it.next() {
            Some(p) if !p.is_empty() => p.to_string(),
            _ => continue,
        };
        files.push(FileSummary {
            path,
            add: add_s.parse().unwrap_or(0),
            del: del_s.parse().unwrap_or(0),
        });
    }
    // New (untracked) files are the agent's most common output and `git diff`
    // can't see them — list them as pure additions.
    for path in untracked_files(&worktree) {
        let add = untracked_line_count(&worktree, &path);
        files.push(FileSummary { path, add, del: 0 });
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

/// Per-file unified diff parsed into hunks for the diff viewer.
#[tauri::command]
pub fn git_diff_file(issue_key: String, path: String) -> Result<FileDiff, String> {
    let (repo, worktree) = work_dir_for(&issue_key)?;
    // `--no-index` below would happily read any file on disk.
    crate::helpers::safe_relative_path(&path)?;

    // Untracked files have no base to diff against — synthesize the "all
    // added" diff with --no-index, which exits 1 when differences exist.
    let tracked = crate::claude::discovery::command("git")
        .args(["ls-files", "--error-unmatch", "--", &path])
        .current_dir(&worktree)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let out = if tracked {
        let base = base_ref(&repo);
        let against = diff_base(&worktree, &base);
        crate::claude::discovery::command("git")
            .args(["diff", "--no-color", &against, "--", &path])
            .current_dir(&worktree)
            .output()
            .map_err(|e| format!("git diff failed to start: {e}"))?
    } else {
        crate::claude::discovery::command("git")
            .args(["diff", "--no-color", "--no-index", "--", "/dev/null", &path])
            .current_dir(&worktree)
            .output()
            .map_err(|e| format!("git diff failed to start: {e}"))?
    };
    // --no-index reports differences via exit code 1, so only treat >1 (or a
    // tracked-diff non-zero) with stderr content as failure.
    if !out.status.success() && (tracked || out.status.code() != Some(1)) {
        return Err(format!(
            "git diff failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_unified(&path, &text))
}
