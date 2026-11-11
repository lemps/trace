//! The Terminal tab's shell: a plain login shell in the workspace's folder,
//! beside its agent. Always on this machine (`execution::Capabilities::terminal`).

use tauri::{AppHandle, State};

use crate::claude::pty::spawn_shell_pty;
use crate::git;
use crate::helpers::slugify;
use crate::state::{AppState, StartGuard};

/// Start a plain shell in the issue's worktree — the "Terminal" tab, separate
/// from the Claude agent in Chat. Keyed by `term:<issue>` so it coexists with the
/// agent session. Ensures the worktree exists first. Idempotent.
#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    issue_key: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let term_id = format!("term:{issue_key}");
    if state.pty_sessions.lock().contains_key(&term_id) {
        return Ok(());
    }
    let Some(_guard) = StartGuard::acquire(&state, &term_id) else {
        return Ok(());
    };

    // The shell opens wherever the workspace's agent runs: a session's worktree
    // (created on demand, using the session's own repo — not the global default),
    // the repo root for legacy root sessions, or the issue's worktree.
    let cwd = if crate::commands::session::is_session(&issue_key) {
        crate::commands::session::session_cwd(&issue_key, true)?
    } else {
        crate::commands::issue_host::require_local(&issue_key, "A terminal")?;
        let repo = crate::commands::repos::repo_for(&issue_key)?;
        let worktree = crate::commands::repos::workspace_dir(&repo, &issue_key);
        if !std::path::Path::new(&worktree).exists() {
            let busy = git::git_busy_check(&repo);
            if busy.starts_with("busy") {
                return Err(format!(
                    "Repository is {busy} — finish that git operation first."
                ));
            }
            let branch = format!("workspace/{}", slugify(&issue_key));
            let default_branch = git::get_default_branch(&repo);
            git::create_worktree(&repo, &worktree, &branch, &default_branch)?;
        }
        worktree
    };

    let (session, pid) = spawn_shell_pty(app, term_id.clone(), cwd, cols.max(20), rows.max(4))?;
    // The Terminal tab is a shell on this machine (`Capabilities::terminal`).
    state
        .pty_sessions
        .lock()
        .insert(term_id.clone(), Box::new(session));
    if let Some(pid) = pid {
        state.child_pids.lock().insert(term_id, pid);
    }
    Ok(())
}
