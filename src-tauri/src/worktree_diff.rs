//! A workspace's changes against `origin/<default-branch>`, as git sees them: the
//! change list for the Files tree (status and line counts per path) and one
//! file's diff. Blocking: the commands in `commands/diff.rs` run these off the
//! main thread.
//!
//! Every path handed to git goes after `--literal-pathspecs`, so a file named
//! `app/[id].tsx` is that file and not a glob that also matches `app/i.tsx`.

use serde::Serialize;

use crate::diff_parse::{parse_unified, FileDiff};
use crate::diff_summary::{parse_raw_numstat, ChangeKind, FileSummary};
use crate::git;
use crate::workspace_dir::work_dir_for;

/// `git` with paths taken literally (no globs, no magic).
fn git_literal() -> std::process::Command {
    let mut cmd = crate::claude::discovery::command("git");
    cmd.arg("--literal-pathspecs");
    cmd
}

/// A workspace's change list.
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

/// The commit to diff against: the merge-base of the workspace and the default
/// branch — "what changed since this branch forked". Diffing `origin/main`
/// directly (two-dot) would show upstream commits the worktree lacks as
/// phantom deletions. Falls back to the branch ref if merge-base fails
/// (e.g. unborn HEAD).
fn diff_base(work_dir: &str, base: &str) -> String {
    let out = git_literal()
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
    git_literal()
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
pub fn summary(issue_key: &str) -> Result<DiffSummary, String> {
    let (repo, worktree) = work_dir_for(issue_key)?;
    let base = base_ref(&repo);
    let against = diff_base(&worktree, &base);
    // `--raw` adds each path's status to numstat's counts; `-z` keeps paths verbatim
    // (renames as two plain paths); `-M` finds renames whatever `diff.renames` says.
    let out = git_literal()
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

pub fn file_diff(issue_key: &str, path: &str, old_path: Option<&str>) -> Result<FileDiff, String> {
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
        git_literal()
            .args(["diff", "--no-color", "--no-index", "--", "/dev/null", path])
            .current_dir(&worktree)
            .output()
            .map_err(|e| format!("git diff failed to start: {e}"))?
    } else {
        let base = base_ref(&repo);
        let against = diff_base(&worktree, &base);
        let mut paths = vec![path];
        paths.extend(old_path);
        git_literal()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bracketed_name_is_a_file_not_a_glob() {
        let dir = std::env::temp_dir().join(format!("trace-diff-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(dir.join("app")).unwrap();
        let git = |args: &[&str]| {
            let ok = crate::claude::discovery::command("git")
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap()
                .status
                .success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q"]);
        std::fs::write(dir.join("app/[id].tsx"), "tracked").unwrap();
        git(&["add", "app/[id].tsx"]);
        std::fs::write(dir.join("app/i.tsx"), "untracked").unwrap();

        let work = dir.to_str().unwrap();
        assert!(untracked_files(work, &["app/[id].tsx"]).is_empty());
        assert_eq!(untracked_files(work, &["app/i.tsx"]), vec!["app/i.tsx"]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
