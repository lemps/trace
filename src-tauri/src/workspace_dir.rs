//! Where a workspace's files are, for the Files tab and Quick Open.

use crate::commands::{repos, session};

/// Resolve `(repo, work_dir)` for a workspace. A ticket's agent works in its
/// worktree at `.worktrees/<slug>` of its assigned repo (the repo root until that
/// exists). A session works in its own repo: its worktree once started, the repo
/// root before. A session in a plain folder has no repo, so nothing to diff.
pub fn work_dir_for(workspace_id: &str) -> Result<(String, String), String> {
    if let Some(owner) = session::owning_session(workspace_id) {
        if owner.folder.is_some() {
            return Err("This session runs in a plain folder, so it has no diff.".to_string());
        }
        let cwd = session::cwd_of(&owner, false)?;
        let repo = owner
            .repo
            .or_else(repos::default_repo)
            .ok_or_else(|| "Choose a repository folder in Settings first.".to_string())?;
        return Ok((repo, cwd));
    }
    // Issues resolve to their assigned repo; anything unassigned to the default one.
    let repo = repos::repo_for(workspace_id)
        .ok()
        .or_else(repos::default_repo)
        .ok_or_else(|| "Choose a repository folder in Settings first.".to_string())?;
    let worktree = repos::workspace_dir(&repo, workspace_id);
    if std::path::Path::new(&worktree).exists() {
        Ok((repo, worktree))
    } else {
        Ok((repo.clone(), repo))
    }
}
