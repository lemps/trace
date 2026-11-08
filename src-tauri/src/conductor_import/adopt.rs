//! Taking over a live Conductor workspace as a trace session.
//!
//! The worktree is moved (`git worktree move`, so branch and uncommitted work
//! come along) into `<repo>/.worktrees/<dir>`, and a session is recorded that
//! adopts that dir (`dir_overrides`). Claude keys a conversation by its cwd, so
//! the transcript is copied to the new path's project folder too, and its id
//! saved for the session's first start to `--resume`. Conductor's own files are
//! only read: the transcript is copied, never moved.

use std::path::Path;

use super::model::{WorkspacePreview, WorkspaceStatus};
use crate::claude::conversations::{conversation_path, upsert_session_id};
use crate::commands::session::ScratchSession;

/// What adopting a workspace made.
#[derive(Debug)]
pub struct Adopted {
    pub session_id: String,
    pub path: String,
    /// Its conversation was carried over, so the first start resumes it.
    pub resumes: bool,
}

/// Adopt `ws` (whose repo must already be in trace) as a new session.
pub fn adopt(ws: &WorkspacePreview) -> Result<Adopted, String> {
    if ws.status == WorkspaceStatus::FolderMissing {
        return Err("Its folder isn't there any more.".to_string());
    }
    let repo = ws.repo_root.as_str();
    let busy = crate::git::git_busy_check(repo);
    if busy != "clean" {
        return Err(format!(
            "{} is {busy}: finish that git operation first.",
            ws.repo_name
        ));
    }
    // Found before the move: the old path is how Claude filed it.
    let transcript = match (&ws.claude_session_id, ws.cli.as_str()) {
        (Some(id), "claude") => super::workspaces::transcript(Path::new(&ws.path), id),
        _ => None,
    };
    let dir = free_dirname(repo, &ws.directory_name)?;
    let target = crate::platform::paths::worktree_dir(repo, &dir);
    crate::git::move_worktree(repo, &ws.path, &target)?;

    // The folder has moved. Everything below records where it went, and a
    // failure says where, so nothing is lost.
    let at = |e: String| format!("{e} (the worktree is now at {target})");
    let session = new_session(ws);
    crate::commands::repos::adopt_workspace_dir(&session.id, &dir, repo).map_err(at)?;
    let mut resumes = false;
    if let (Some(from), Some(id)) = (transcript, &ws.claude_session_id) {
        let to = conversation_path(&target, id);
        if to.is_some_and(|to| copy_transcript(&from, &to, id).is_ok()) {
            upsert_session_id(&session.id, id).map_err(at)?;
            resumes = true;
        }
    }
    let id = session.id.clone();
    crate::commands::session::update(|list| list.push(session)).map_err(at)?;
    Ok(Adopted {
        session_id: id,
        path: target,
        resumes,
    })
}

/// `wanted`, or `wanted-conductor`, `-conductor-2`… : the first name no
/// checkout or workspace in `repo` already has.
fn free_dirname(repo: &str, wanted: &str) -> Result<String, String> {
    let wanted = crate::helpers::slugify(wanted);
    let taken = |name: &str| -> Result<bool, String> {
        let on_disk = Path::new(&crate::platform::paths::worktree_dir(repo, name)).exists();
        Ok(on_disk || !crate::commands::repos::dir_adopters(name)?.is_empty())
    };
    let mut name = wanted.clone();
    let mut n = 1;
    while taken(&name)? {
        name = if n == 1 {
            format!("{wanted}-conductor")
        } else {
            format!("{wanted}-conductor-{n}")
        };
        n += 1;
    }
    Ok(name)
}

fn new_session(ws: &WorkspacePreview) -> ScratchSession {
    let title = ws
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| ws.directory_name.clone());
    ScratchSession {
        id: crate::helpers::new_id(),
        title,
        cli: ws.cli.clone(),
        provider: None,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        archived_at: None,
        tab: None,
        section: None,
        worktree: true,
        repo: Some(ws.repo_root.clone()),
        folder: None,
        agents: Vec::new(),
        remote_control: false,
        created_by: None,
        host: None,
    }
}

/// Copy conversation `id`'s JSONL at `from` to `to` (inside the project folder
/// of the new cwd), with the folder of subagent transcripts beside it, if any.
/// Anything already there is kept.
fn copy_transcript(from: &Path, to: &Path, id: &str) -> std::io::Result<()> {
    let parent = to
        .parent()
        .ok_or_else(|| std::io::Error::other("no project folder"))?;
    std::fs::create_dir_all(parent)?;
    if !to.exists() {
        std::fs::copy(from, to)?;
    }
    if let Some(dir) = from.parent().map(|p| p.join(id)).filter(|d| d.is_dir()) {
        copy_dir(&dir, &parent.join(id))?;
    }
    Ok(())
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let (src, dst) = (entry.path(), to.join(entry.file_name()));
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&src, &dst)?;
        } else if kind.is_file() && !dst.exists() {
            std::fs::copy(&src, &dst)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(dir: &Path, args: &[&str]) -> String {
        let out = crate::claude::discovery::command("git")
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    #[test]
    fn copies_a_transcript_and_its_subagents_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let old = dir.path().join("old-slug");
        std::fs::create_dir_all(old.join("c1/subagents")).unwrap();
        std::fs::write(old.join("c1.jsonl"), "{}\n").unwrap();
        std::fs::write(old.join("c1/subagents/a.jsonl"), "{}\n").unwrap();
        let to = dir.path().join("new-slug/c1.jsonl");
        copy_transcript(&old.join("c1.jsonl"), &to, "c1").unwrap();
        assert!(to.is_file());
        assert!(dir.path().join("new-slug/c1/subagents/a.jsonl").is_file());
        assert!(old.join("c1.jsonl").is_file(), "the original stays");
        std::fs::write(old.join("c1/subagents/a.jsonl"), "changed").unwrap();
        copy_transcript(&old.join("c1.jsonl"), &to, "c1").unwrap();
        let kept = std::fs::read_to_string(dir.path().join("new-slug/c1/subagents/a.jsonl"));
        assert_eq!(kept.unwrap(), "{}\n");
    }

    /// A Conductor-style worktree outside the repo moves into `.worktrees/` with
    /// its branch and uncommitted work, and git knows it at the new path.
    #[test]
    fn moving_a_worktree_keeps_its_branch_and_changes() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        git(&repo, &["init", "-q", "-b", "main"]);
        git(
            &repo,
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "init",
            ],
        );
        let old = dir.path().join("conductor/workspaces/repo/lima");
        let old_s = old.to_string_lossy().to_string();
        git(&repo, &["worktree", "add", "-q", "-b", "me/lima", &old_s]);
        std::fs::write(old.join("wip.txt"), "unsaved").unwrap();

        let repo_s = repo.to_string_lossy().to_string();
        let target = crate::platform::paths::worktree_dir(&repo_s, "lima");
        crate::git::move_worktree(&repo_s, &old_s, &target).unwrap();

        let target = Path::new(&target);
        assert!(!old.exists());
        assert_eq!(
            std::fs::read_to_string(target.join("wip.txt")).unwrap(),
            "unsaved"
        );
        assert_eq!(git(target, &["branch", "--show-current"]).trim(), "me/lima");
        let list = super::super::workspaces::git_worktrees(&repo);
        assert!(
            list.iter()
                .any(|w| w.branch.as_deref() == Some("me/lima")
                    && w.path.ends_with(".worktrees/lima"))
        );
        assert!(
            git(&repo, &["status", "--porcelain"]).is_empty(),
            ".worktrees is excluded"
        );
        let again = crate::git::move_worktree(&repo_s, &old_s, &target.to_string_lossy());
        assert!(again.is_err(), "never overwrites");
    }
}
