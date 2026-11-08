//! What trace knows about each repository beyond its folder: where it's hosted,
//! its default branch, and how to set up a new worktree of it.
//!
//! - `model`: [`model::RepoRecord`] — a repo has a remote and any number of
//!   checkouts (local today; remote execution adds a kind), so nothing here
//!   assumes a repo is a folder on this machine.
//! - `store`: `repo-catalog.json`, plus the folder new clones go in.
//! - `suggest`: a first guess at setup from a repo's lockfiles.
//! - `setup`: running it after `git::create_worktree` makes a worktree.

pub mod model;
pub mod setup;
pub mod store;
pub mod suggest;

use serde::Serialize;

use model::{parse_remote_url, RemoteRepo, SetupConfig};

/// One configured repo, as Settings shows it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoDetails {
    /// The local checkout, as listed in `repos.json`.
    pub path: String,
    pub remote: Option<RemoteRepo>,
    pub default_branch: String,
    pub setup: SetupConfig,
    /// The GitHub account picked for it in Settings; None = automatic.
    pub github_account: Option<String>,
}

/// The `origin` of the checkout at `path`, parsed. `None` without one.
pub fn origin_of(path: &str) -> Option<RemoteRepo> {
    let out = crate::claude::discovery::command("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(path)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_remote_url(&String::from_utf8_lossy(&out.stdout))
}

/// Details for each of `paths` (the configured repos). The remote comes from the
/// record, or from `origin` for a repo added by folder.
pub fn details(paths: &[String]) -> Vec<RepoDetails> {
    let catalog = store::load();
    paths
        .iter()
        .map(|path| {
            let record = catalog.for_path(path);
            RepoDetails {
                path: path.clone(),
                remote: record
                    .and_then(|r| r.remote.clone())
                    .or_else(|| origin_of(path)),
                default_branch: crate::git::get_default_branch(path),
                setup: record.map(|r| r.setup.clone()).unwrap_or_default(),
                github_account: record.and_then(|r| r.github_account.clone()),
            }
        })
        .collect()
}

/// (remote, checkout) for each of `paths` that has a remote — what marks a
/// GitHub repo as already checked out.
pub fn known_remotes(paths: &[String]) -> Vec<(RemoteRepo, String)> {
    let catalog = store::load();
    paths
        .iter()
        .filter_map(|path| {
            let remote = catalog
                .for_path(path)
                .and_then(|r| r.remote.clone())
                .or_else(|| origin_of(path))?;
            Some((remote, path.clone()))
        })
        .collect()
}

/// The setup saved for `remote`, from any of its checkouts.
pub fn saved_setup(remote: &RemoteRepo) -> Option<SetupConfig> {
    store::load()
        .records
        .into_iter()
        .find(|r| r.remote.as_ref().is_some_and(|x| x.same_as(remote)))
        .map(|r| r.setup)
}

/// The GitHub account set for the repo checked out at `path`, if one is.
pub fn github_account_for(path: &str) -> Option<String> {
    store::load().for_path(path)?.github_account.clone()
}

/// The GitHub account the SSH alias in `path`'s origin names, if it uses one
/// (`git@github.com-noble1911:…`).
pub fn origin_alias_account(path: &str) -> Option<String> {
    let out = crate::claude::discovery::command("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(path)
        .output()
        .ok()?;
    out.status.success().then_some(())?;
    model::github_alias_account(&String::from_utf8_lossy(&out.stdout))
}

/// Set (or with None, clear) the GitHub account for the repo at `path`.
pub fn set_github_account(path: &str, login: Option<String>) -> Result<(), String> {
    let login = login
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty());
    let remote = origin_of(path);
    store::update(|cat| cat.set_github_account(path, remote, login))
}

/// Save the setup of the repo checked out at `path`.
pub fn set_setup(path: &str, setup: SetupConfig) -> Result<SetupConfig, String> {
    let setup = setup.sanitized()?;
    let remote = origin_of(path);
    let saved = setup.clone();
    store::update(|cat| cat.set_setup(path, remote, setup))?;
    Ok(saved)
}
