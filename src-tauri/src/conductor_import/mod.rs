//! Settings → Repositories → Import from Conductor.
//!
//! Conductor is shutting down, and its users are moving to trace. This reads
//! what Conductor knows (never writing to it) and brings over its repos with
//! their setup, its live workspaces as sessions that carry on, and its defaults.
//!
//! - `db`: a private, read-only copy of `conductor.db`; no secrets selected.
//! - `config` (+ `translate`, `include`): repo scripts, layered, as a `SetupConfig`.
//! - `workspaces`: where each workspace really is, and whether it can resume.
//! - `adopt`: moving one into `.worktrees/` as a trace session.
//! - `prompts` (+ `prompt_apply`): repos' custom prompts as saved prompts.
//! - `apply`: importing the user's selection, with a report.

pub mod adopt;
pub mod apply;
pub mod config;
pub mod db;
pub mod include;
pub mod model;
pub mod prompt_apply;
pub mod prompts;
pub mod translate;
pub mod workspaces;

use std::path::{Path, PathBuf};

use crate::saved_prompts::SavedPrompt;
use db::{Row, Snapshot};
use model::{Defaults, Preview, RepoPreview};

/// Where Conductor keeps its database (macOS: Application Support).
pub fn db_path() -> Option<PathBuf> {
    Some(
        dirs::data_dir()?
            .join("com.conductor.app")
            .join("conductor.db"),
    )
}

/// Whether Conductor has been used on this computer.
pub fn detect() -> bool {
    db_path().is_some_and(|p| p.is_file())
}

/// What an import would bring over, read from the real Conductor data.
pub fn preview() -> Result<Preview, String> {
    let db = db_path()
        .filter(|p| p.is_file())
        .ok_or("Conductor's database isn't on this computer.")?;
    let home = dirs::home_dir().ok_or("No home folder.")?;
    let known = crate::commands::repos::all_repos();
    // An unreadable prompts file shouldn't block the rest: saving reports it.
    let saved = crate::saved_prompts::list().unwrap_or_default();
    Ok(preview_of(&db::read(&db)?, &home, &known, &saved))
}

/// The preview of `snap`, with `known` the repos trace already has and `saved`
/// its saved prompts.
pub fn preview_of(
    snap: &Snapshot,
    home: &Path,
    known: &[String],
    saved: &[SavedPrompt],
) -> Preview {
    let mut rows: Vec<&Row> = snap
        .repos
        .iter()
        .filter(|r| r.get("hidden").is_none_or(|h| h == "0"))
        .collect();
    rows.sort_by_key(|r| {
        r.get("display_order")
            .and_then(|o| o.parse::<i64>().ok())
            .unwrap_or(i64::MAX)
    });
    let repos = rows
        .iter()
        .filter_map(|row| repo_preview(row, home, known))
        .collect();
    Preview {
        repos,
        workspaces: workspaces::previews(snap, home),
        defaults: defaults(snap),
        prompts: prompts::plan(&rows, saved),
        saved_prompt_names: saved.iter().map(|p| p.name.clone()).collect(),
    }
}

fn repo_preview(row: &Row, home: &Path, known: &[String]) -> Option<RepoPreview> {
    let (id, root) = (row.get("id")?, row.get("root_path")?);
    let root_path = Path::new(root);
    let exists = root_path.is_dir() && crate::git::is_git_repo(root);
    let translated = config::translate(row, root_path, home);
    Some(RepoPreview {
        id: id.clone(),
        name: row
            .get("name")
            .cloned()
            .unwrap_or_else(|| crate::platform::paths::basename(root)),
        root_path: root.clone(),
        remote_url: row.get("remote_url").cloned(),
        exists,
        already_added: known.contains(root),
        setup: translated.setup,
        not_imported: translated.not_imported,
        notes: translated.notes,
    })
}

/// Permission modes worth carrying over (`default` is Claude's own default).
const PERMISSION_MODES: &[&str] = &["acceptEdits", "plan", "bypassPermissions"];

fn defaults(snap: &Snapshot) -> Defaults {
    let setting = |k: &str| {
        snap.settings
            .get(k)
            .filter(|v| !v.trim().is_empty())
            .cloned()
    };
    // No app-wide setting in most versions: the mode most chats used is the
    // habit (one plan-mode chat shouldn't make every agent start in plan mode).
    let usual_mode = || {
        let mut counts: std::collections::HashMap<&str, usize> = Default::default();
        for mode in snap
            .sessions
            .iter()
            .filter_map(|s| s.get("permission_mode"))
        {
            *counts.entry(mode.as_str()).or_default() += 1;
        }
        counts
            .into_iter()
            .max_by_key(|(mode, n)| (*n, *mode))
            .map(|(mode, _)| mode.to_string())
    };
    let permission_mode = setting("default_permission_mode")
        .or_else(usual_mode)
        .filter(|m| PERMISSION_MODES.contains(&m.as_str()));
    let open_in = setting("default_open_in");
    let editor = open_in.as_deref().and_then(editor_id).map(str::to_string);
    Defaults {
        model: setting("default_model").map(|m| m.trim().to_string()),
        permission_mode,
        editor_unknown: if editor.is_none() { open_in } else { None },
        editor,
    }
}

/// trace's editor id for Conductor's "open in" choice.
fn editor_id(open_in: &str) -> Option<&'static str> {
    match open_in
        .to_ascii_lowercase()
        .replace([' ', '-', '_'], "")
        .as_str()
    {
        "vscode" | "code" | "visualstudiocode" => Some("vscode"),
        "intellij" | "idea" | "intellijidea" => Some("intellij"),
        "cursor" => Some("cursor"),
        _ => None,
    }
}

#[cfg(test)]
mod prompt_tests;
#[cfg(test)]
mod tests;
