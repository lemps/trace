//! The GitHub integration: signing trace in with its own token, the user's
//! repos, and checking one out for agents. Every call uses the stored token
//! (`github::token`) over GitHub's REST API; none needs `gh`. The token never
//! crosses to the renderer.

use crate::commands::repos;
use crate::github::account::{self, GitHubStatus};
use crate::github::clone::{self, Cloned};
use crate::github::device::{self, DeviceStart};
use crate::github::repo_list::{self, GhRepo};
use crate::github::token::{self, Source, Token};
use crate::repo_catalog::{self, store};

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Who trace's token belongs to, its scopes and expiry, and which sign-in
/// options this machine has.
#[tauri::command]
pub async fn github_status() -> Result<GitHubStatus, String> {
    Ok(account::status().await)
}

/// Check a pasted personal access token and keep it.
#[tauri::command]
pub async fn github_sign_in_token(token: String) -> Result<GitHubStatus, String> {
    let token = Token::new(&token).ok_or("That doesn't look like a GitHub token.")?;
    account::sign_in(token, Source::Pasted).await
}

/// Copy `gh`'s token once; after this trace doesn't need `gh` for GitHub.
#[tauri::command]
pub async fn github_import_gh() -> Result<GitHubStatus, String> {
    let token = blocking(account::gh_token).await?;
    account::sign_in(token, Source::Gh).await
}

/// Start the OAuth device flow: the code to enter on github.com.
#[tauri::command]
pub async fn github_device_start() -> Result<DeviceStart, String> {
    device::start().await
}

/// Wait for the user to approve the device code, then keep the token.
#[tauri::command]
pub async fn github_device_wait() -> Result<GitHubStatus, String> {
    let token = device::wait().await?;
    account::sign_in(token, Source::Device).await
}

/// Stop a device sign-in in progress.
#[tauri::command]
pub fn github_device_cancel() {
    device::cancel();
}

/// Delete trace's GitHub token.
#[tauri::command]
pub fn github_sign_out() -> Result<(), String> {
    device::cancel();
    token::clear()
}

/// Owners whose repos can be listed: the signed-in `login`, then the orgs the
/// token can see.
#[tauri::command]
pub async fn github_owners(login: String) -> Result<Vec<String>, String> {
    if !repo_list::is_login(&login) {
        return Err(format!("{login} isn't a GitHub account name."));
    }
    let token = account::require_token()?;
    let mut owners = vec![login.clone()];
    owners.extend(repo_list::orgs(&token, &login).await);
    Ok(owners)
}

/// `owner`'s repos (the user's own when `None`), each marked with its local
/// checkout if trace already has one.
#[tauri::command]
pub async fn github_repos(owner: Option<String>) -> Result<Vec<GhRepo>, String> {
    let token = account::require_token()?;
    let mut list = repo_list::list(&token, owner.as_deref()).await?;
    let known = blocking(|| Ok(repo_catalog::known_remotes(&repos::all_repos()))).await?;
    repo_list::mark_local(&mut list, &known);
    Ok(list)
}

/// Clone `full_name` into the clone folder with trace's token and add it to
/// trace's repositories.
#[tauri::command]
pub async fn github_clone(full_name: String) -> Result<Cloned, String> {
    blocking(move || {
        let remote = clone::parse_full_name(&full_name)?;
        let token = account::require_token()?;
        let saved = repo_catalog::saved_setup(&remote);
        let cloned = clone::clone_into(remote, &store::clone_root(), Some(token), saved)?;
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
