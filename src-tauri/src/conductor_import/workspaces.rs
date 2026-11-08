//! Where each Conductor workspace is on disk, and whether its conversation can
//! carry on. The database's paths, branches and states go stale, so git's own
//! `worktree list` decides what's really there.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::db::{Row, Snapshot};
use super::model::{WorkspacePreview, WorkspaceStatus};

/// A worktree git knows about: its path and checked-out branch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitWorktree {
    pub path: PathBuf,
    pub branch: Option<String>,
}

/// The worktrees of the repo at `root`, from `git worktree list --porcelain`.
pub fn git_worktrees(root: &Path) -> Vec<GitWorktree> {
    let Ok(out) = crate::claude::discovery::command("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(root)
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    parse_worktree_list(&String::from_utf8_lossy(&out.stdout))
}

fn parse_worktree_list(text: &str) -> Vec<GitWorktree> {
    let mut out: Vec<GitWorktree> = Vec::new();
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            out.push(GitWorktree {
                path: PathBuf::from(path),
                branch: None,
            });
        } else if let (Some(branch), Some(last)) = (line.strip_prefix("branch "), out.last_mut()) {
            last.branch = Some(branch.trim_start_matches("refs/heads/").to_string());
        }
    }
    out
}

/// Where Conductor would have put workspace `dir` of repo `name`: under
/// `~/conductor/workspaces/` for storage version 3, inside the repo's own
/// `.conductor/` before that. Both are returned, the likelier first.
pub fn candidates(
    version: Option<i64>,
    root: &Path,
    name: &str,
    dir: &str,
    home: &Path,
) -> Vec<PathBuf> {
    let central = home
        .join("conductor")
        .join("workspaces")
        .join(name)
        .join(dir);
    let inside = root.join(".conductor").join(dir);
    if version.unwrap_or(3) >= 3 {
        vec![central, inside]
    } else {
        vec![inside, central]
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    a == b
        || matches!(
            (std::fs::canonicalize(a), std::fs::canonicalize(b)),
            (Ok(x), Ok(y)) if x == y
        )
}

/// The candidate git lists as a worktree of the repo, with its branch; or the
/// likeliest candidate, not found.
pub fn locate(
    candidates: &[PathBuf],
    worktrees: &[GitWorktree],
) -> (PathBuf, Option<String>, bool) {
    for c in candidates {
        if let Some(wt) = worktrees.iter().find(|w| same_path(&w.path, c)) {
            return (c.clone(), wt.branch.clone(), c.is_dir());
        }
    }
    (candidates[0].clone(), None, false)
}

/// Whether Claude still has conversation `id` for a session run in `cwd`,
/// checking the path as given and as the filesystem resolves it.
pub fn transcript(cwd: &Path, id: &str) -> Option<PathBuf> {
    let mut paths = vec![cwd.to_path_buf()];
    if let Ok(real) = std::fs::canonicalize(cwd) {
        paths.push(real);
    }
    paths.iter().find_map(|p| {
        crate::claude::conversations::conversation_path(&p.to_string_lossy(), id)
            .filter(|t| t.is_file())
    })
}

/// The session that carries a workspace on: its active one if it can, else the
/// most recently updated visible one with a Claude id. Also returns how many
/// others the workspace has.
pub fn pick_session<'a>(ws: &Row, sessions: &[&'a Row]) -> (Option<&'a Row>, usize) {
    let visible = |s: &&&Row| s.get("is_hidden").is_none_or(|h| h == "0");
    let active = ws
        .get("active_session_id")
        .and_then(|id| sessions.iter().find(|s| s.get("id") == Some(id)))
        .filter(|s| s.contains_key("claude_session_id"));
    let chosen = active.copied().or_else(|| {
        sessions
            .iter()
            .filter(visible)
            .filter(|s| s.contains_key("claude_session_id"))
            .max_by(|a, b| a.get("updated_at").cmp(&b.get("updated_at")))
            .copied()
    });
    let others =
        sessions.iter().filter(visible).count() - usize::from(chosen.is_some_and(|c| visible(&&c)));
    (chosen, others)
}

/// Every workspace in `snap`, located and given a status.
pub fn previews(snap: &Snapshot, home: &Path) -> Vec<WorkspacePreview> {
    let mut by_ws: HashMap<&str, Vec<&Row>> = HashMap::new();
    for s in &snap.sessions {
        if let Some(ws) = s.get("workspace_id") {
            by_ws.entry(ws.as_str()).or_default().push(s);
        }
    }
    let mut git_cache: HashMap<String, Vec<GitWorktree>> = HashMap::new();
    let mut out = Vec::new();
    for ws in &snap.workspaces {
        let (Some(id), Some(repo_id), Some(dir)) = (
            ws.get("id"),
            ws.get("repository_id"),
            ws.get("directory_name"),
        ) else {
            continue;
        };
        let Some(repo) = snap.repos.iter().find(|r| r.get("id") == Some(repo_id)) else {
            continue;
        };
        let (Some(root), Some(name)) = (repo.get("root_path"), repo.get("name")) else {
            continue;
        };
        let root_path = Path::new(root);
        let version = repo.get("storage_version").and_then(|v| v.parse().ok());
        let cands = candidates(version, root_path, name, dir, home);
        let trees = git_cache
            .entry(root.clone())
            .or_insert_with(|| git_worktrees(root_path));
        let (path, branch, found) = locate(&cands, trees);
        let sessions = by_ws.get(id.as_str()).map(Vec::as_slice).unwrap_or(&[]);
        let (session, other_sessions) = pick_session(ws, sessions);
        let claude_id = session.and_then(|s| s.get("claude_session_id")).cloned();
        let status = match (found, &claude_id) {
            (false, _) => WorkspaceStatus::FolderMissing,
            (true, Some(cid)) if transcript(&path, cid).is_some() => WorkspaceStatus::Resumable,
            (true, _) => WorkspaceStatus::TranscriptMissing,
        };
        let cli = match session
            .and_then(|s| s.get("agent_type"))
            .map(String::as_str)
        {
            Some("codex") => "codex",
            _ => "claude",
        };
        out.push(WorkspacePreview {
            id: id.clone(),
            repo_id: repo_id.clone(),
            repo_name: name.clone(),
            repo_root: root.clone(),
            directory_name: dir.clone(),
            path: path.to_string_lossy().into_owned(),
            branch: branch.or_else(|| ws.get("branch").cloned()),
            archived: ws.get("state").is_some_and(|s| s == "archived"),
            status,
            title: session.and_then(|s| s.get("title")).cloned(),
            claude_session_id: claude_id,
            cli: cli.to_string(),
            other_sessions,
        });
    }
    // Live first, then by name.
    out.sort_by(|a, b| {
        (a.archived, &a.repo_name, &a.directory_name).cmp(&(
            b.archived,
            &b.repo_name,
            &b.directory_name,
        ))
    });
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pairs: &[(&str, &str)]) -> Row {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn parses_porcelain_worktree_lists() {
        let text = "worktree /r\nHEAD abc\nbranch refs/heads/main\n\n\
                    worktree /w/lima\nHEAD def\nbranch refs/heads/me/lima\n\n\
                    worktree /w/detached\nHEAD 123\ndetached\n";
        let list = parse_worktree_list(text);
        assert_eq!(list.len(), 3);
        assert_eq!(list[1].branch.as_deref(), Some("me/lima"));
        assert_eq!(list[2].branch, None);
    }

    #[test]
    fn storage_version_orders_the_candidates() {
        let (root, home) = (Path::new("/src/app"), Path::new("/home/me"));
        let v3 = candidates(Some(3), root, "app", "lima", home);
        assert_eq!(v3[0], Path::new("/home/me/conductor/workspaces/app/lima"));
        let v2 = candidates(Some(2), root, "app", "lima", home);
        assert_eq!(v2[0], Path::new("/src/app/.conductor/lima"));
    }

    #[test]
    fn prefers_the_active_session_then_the_latest() {
        let a = row(&[
            ("id", "a"),
            ("claude_session_id", "ca"),
            ("updated_at", "1"),
            ("is_hidden", "0"),
        ]);
        let b = row(&[
            ("id", "b"),
            ("claude_session_id", "cb"),
            ("updated_at", "2"),
            ("is_hidden", "0"),
        ]);
        let h = row(&[
            ("id", "h"),
            ("claude_session_id", "ch"),
            ("updated_at", "9"),
            ("is_hidden", "1"),
        ]);
        let sessions = vec![&a, &b, &h];
        let (s, others) = pick_session(&row(&[("active_session_id", "a")]), &sessions);
        assert_eq!(s.and_then(|s| s.get("id")).map(String::as_str), Some("a"));
        assert_eq!(others, 1);
        let (s, _) = pick_session(&row(&[("active_session_id", "gone")]), &sessions);
        assert_eq!(s.and_then(|s| s.get("id")).map(String::as_str), Some("b"));
        let (s, others) = pick_session(&Row::new(), &[]);
        assert!(s.is_none());
        assert_eq!(others, 0);
    }
}
