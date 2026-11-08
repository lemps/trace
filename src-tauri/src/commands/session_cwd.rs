//! Where a session's agents run: its worktree (made on demand), a legacy
//! session's repo root, or its plain folder.

use crate::commands::session::{owning_session, ScratchSession};
use crate::commands::session_folder;
use crate::git;

/// Resolve the working directory for a scratch session, honoring the session's
/// own `repo` (not the global default) so sessions created against a non-default
/// repo land in the right place.
///
/// A worktree-backed session runs in `<repo>/.worktrees/<slug>`. `create`
/// controls what happens when that worktree isn't on disk yet:
/// - `true` (agent start, shell terminal): create it on demand — mirrors
///   `start_session`, so the shell always opens in the session's worktree
///   rather than falling back to the repo root.
/// - `false` ("open in editor"): fall back to the repo root — opening an editor
///   shouldn't materialize a git worktree as a side effect.
///
/// Legacy sessions without a worktree always resolve to the repo root, where
/// their Claude conversation is keyed. Sessions with a plain `folder` run there.
///
/// `id` may be a companion agent's id: the worktree belongs to the *session*, so
/// every agent on it resolves to the same directory — that shared cwd is the
/// whole point of companions.
pub(crate) fn session_cwd(id: &str, create: bool) -> Result<String, String> {
    let session = owning_session(id).ok_or("That session no longer exists.")?;
    cwd_of(&session, create)
}

/// `session_cwd` for a session already loaded (skips reading the sessions file again).
pub(crate) fn cwd_of(session: &ScratchSession, create: bool) -> Result<String, String> {
    // Its files are on its host: never fall back to a checkout on this computer.
    if session.host.is_some() {
        return Err(
            "This session runs on Vercel: its files are in its sandbox, not on this computer."
                .to_string(),
        );
    }
    if let Some(folder) = &session.folder {
        return session_folder::folder_cwd(&session_folder::scratch_root(), folder, create);
    }
    let repo = session
        .repo
        .clone()
        .or_else(crate::commands::repos::default_repo)
        .ok_or("Add a repository in Settings first.")?;
    if !session.worktree {
        return Ok(repo);
    }
    let worktree = crate::commands::repos::workspace_dir(&repo, &session.id);
    if std::path::Path::new(&worktree).exists() {
        return Ok(worktree);
    }
    if !create {
        return Ok(repo);
    }
    let busy = git::git_busy_check(&repo);
    if busy.starts_with("busy") {
        return Err(format!(
            "Repository is {busy} — finish that git operation first."
        ));
    }
    let branch = format!("workspace/{}", crate::helpers::slugify(&session.id));
    let default_branch = git::get_default_branch(&repo);
    git::create_worktree(&repo, &worktree, &branch, &default_branch)?;
    Ok(worktree)
}
