//! The GitHub integration: who `gh` is signed in as, their repos, and checking
//! one out for agents. All of it shells out to `gh` (trace holds no GitHub
//! token), so every command runs off the main thread.

use crate::commands::repos;
use crate::github::account::{self, GhStatus};
use crate::github::clone::{self, Cloned};
use crate::github::repo_list::{self, GhRepo};
use crate::repo_catalog::{self, store};

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Whether `gh` is installed and signed in, and as whom.
#[tauri::command]
pub async fn github_status() -> Result<GhStatus, String> {
    blocking(|| Ok(account::status())).await
}

/// Owners whose repos can be listed: the signed-in `login` (which the renderer
/// already has from `github_status`, so gh's auth isn't checked twice), then
/// their orgs.
#[tauri::command]
pub async fn github_owners(login: String) -> Result<Vec<String>, String> {
    blocking(move || {
        if !repo_list::is_login(&login) {
            return Err(format!("{login} isn't a GitHub account name."));
        }
        let mut owners = vec![login];
        owners.extend(repo_list::orgs());
        Ok(owners)
    })
    .await
}

/// `owner`'s repos (the user's own when `None`), each marked with its local
/// checkout if trace already has one.
#[tauri::command]
pub async fn github_repos(owner: Option<String>) -> Result<Vec<GhRepo>, String> {
    blocking(move || {
        let mut list = repo_list::list(owner.as_deref())?;
        repo_list::mark_local(&mut list, &repo_catalog::known_remotes(&repos::all_repos()));
        Ok(list)
    })
    .await
}

/// Clone `full_name` into the clone folder and add it to trace's repositories.
#[tauri::command]
pub async fn github_clone(full_name: String) -> Result<Cloned, String> {
    blocking(move || {
        let remote = clone::parse_full_name(&full_name)?;
        let saved = repo_catalog::saved_setup(&remote);
        let cloned = clone::clone_into(remote, &store::clone_root(), saved)?;
        repos::add_repo(cloned.path.clone())?;
        let (path, remote, branch) = (
            cloned.path.clone(),
            cloned.remote.clone(),
            cloned.default_branch.clone(),
        );
        store::update(|cat| cat.add_local(&path, Some(remote), Some(branch)))?;
        Ok(cloned)
    })
    .await
}
