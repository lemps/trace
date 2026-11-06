//! Open a workspace in a desktop editor — an issue's worktree or an exploratory
//! session's. `platform::EditorLauncher` says what to try on this OS.
//! Falls back to the repo root when the worktree doesn't exist yet.

use std::path::Path;
use std::process::Stdio;

use crate::platform::ports::{Editor, EditorLauncher};
use crate::platform::Os;

/// Run a launcher binary detached, reporting whether it started successfully.
fn try_launch(binary: &str, args: &[&str], path: &str) -> bool {
    crate::claude::discovery::command(binary)
        .args(args)
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Try this OS's launchers for `editor`, best first.
fn open_with(editor: Editor, path: &str) -> bool {
    Os::launchers(editor)
        .into_iter()
        .any(|(binary, args)| try_launch(binary, args, path))
}

/// Open the workspace's worktree (or the repo root if no worktree yet) in
/// `editor`. `workspace_id` is a Jira issue key or an exploratory session id.
#[tauri::command]
pub fn open_in_editor(issue_key: String, editor: String) -> Result<(), String> {
    // A session resolves its own repo + worktree; an issue resolves its assigned
    // repo (falling back to the default). Neither creates a worktree here —
    // opening an editor shouldn't spawn a checkout — so both open the repo root
    // when no worktree exists yet.
    let path = if crate::commands::session::is_session(&issue_key) {
        crate::commands::session::session_cwd(&issue_key, false)?
    } else {
        let repo = crate::commands::repos::repo_for(&issue_key)
            .ok()
            .or_else(crate::commands::repos::default_repo)
            .ok_or("Add a repository in Settings first.")?;
        let worktree = crate::commands::repos::workspace_dir(&repo, &issue_key);
        if Path::new(&worktree).exists() {
            worktree
        } else {
            repo
        }
    };

    let opened = match editor.trim().to_lowercase().as_str() {
        "vscode" | "code" => open_with(Editor::VsCode, &path),
        "intellij" | "idea" => open_with(Editor::IntelliJ, &path),
        "cursor" => open_with(Editor::Cursor, &path),
        other => return Err(format!("Unsupported editor: {other}")),
    };

    if opened {
        Ok(())
    } else {
        Err(format!(
            "Couldn't open {editor}. Make sure it's installed and on your PATH."
        ))
    }
}
