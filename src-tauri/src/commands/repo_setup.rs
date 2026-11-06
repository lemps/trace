//! Per-repo facts and worktree setup (`repo_catalog`), and the folder new
//! clones go in — the Settings side of the repo model.

use crate::commands::repos;
use crate::repo_catalog::model::SetupConfig;
use crate::repo_catalog::{self, store, suggest, RepoDetails};

/// Each configured repo with its remote, default branch and setup. Runs `git`
/// per repo, so off the main thread.
#[tauri::command]
pub async fn repo_details() -> Result<Vec<RepoDetails>, String> {
    tauri::async_runtime::spawn_blocking(|| repo_catalog::details(&repos::all_repos()))
        .await
        .map_err(|e| e.to_string())
}

fn configured(path: &str) -> Result<(), String> {
    if repos::all_repos().iter().any(|r| r == path) {
        Ok(())
    } else {
        Err("That repository isn't configured.".into())
    }
}

/// Save what runs in each new worktree of the repo at `path`; returns it cleaned.
/// Reads the repo's origin with git, so off the main thread.
#[tauri::command]
pub async fn set_repo_setup(path: String, setup: SetupConfig) -> Result<SetupConfig, String> {
    tauri::async_runtime::spawn_blocking(move || {
        configured(&path)?;
        repo_catalog::set_setup(&path, setup)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A suggested setup for the repo at `path`, from its lockfiles.
#[tauri::command]
pub fn suggest_repo_setup(path: String) -> Result<SetupConfig, String> {
    configured(&path)?;
    Ok(suggest::for_dir(std::path::Path::new(&path)))
}

/// The folder new clones go in.
#[tauri::command]
pub fn clone_root() -> String {
    store::clone_root()
}

/// Change the clone folder. It needn't exist yet; the first clone creates it.
#[tauri::command]
pub fn set_clone_root(path: String) -> Result<String, String> {
    let path = path.trim().to_string();
    if !std::path::Path::new(&path).is_absolute() {
        return Err("Choose a full folder path for clones.".into());
    }
    store::update(|cat| cat.clone_root = Some(path.clone()))?;
    Ok(path)
}
