//! `repo-catalog.json`: the [`RepoRecord`]s plus where new clones go. Kept apart
//! from `repos.json` (the list of local folders agents run in), which stays the
//! source of truth for *which* repos are configured; a record only adds facts.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::model::{Checkout, RemoteRepo, RepoRecord, SetupConfig};
use crate::helpers::persist::{self, Style};

/// The whole of `repo-catalog.json`: one record per repo, so a repo's facts and
/// setup outlive any one checkout of it, plus the clone folder.
#[derive(Serialize, Deserialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    /// Folder new clones go in; `None` means [`default_clone_root`].
    #[serde(default)]
    pub clone_root: Option<String>,
    #[serde(default)]
    pub records: Vec<RepoRecord>,
}

impl Catalog {
    /// The record with a local checkout at `path`.
    pub fn for_path(&self, path: &str) -> Option<&RepoRecord> {
        self.records.iter().find(|r| r.has_local(path))
    }

    /// Record a local checkout at `path`, joining the record for the same remote
    /// when there is one (one repo, many checkouts), else starting one.
    pub fn add_local(&mut self, path: &str, remote: Option<RemoteRepo>, branch: Option<String>) {
        let existing = self.records.iter().position(|r| {
            r.has_local(path) || matches!((&r.remote, &remote), (Some(a), Some(b)) if a.same_as(b))
        });
        let record = match existing {
            Some(i) => &mut self.records[i],
            None => {
                self.records.push(RepoRecord::default());
                let last = self.records.len() - 1;
                &mut self.records[last]
            }
        };
        if remote.is_some() {
            record.remote = remote;
        }
        if branch.is_some() {
            record.default_branch = branch;
        }
        if !record.has_local(path) {
            record.checkouts.push(Checkout::Local {
                path: path.to_string(),
            });
        }
    }

    /// Set the setup of the repo checked out at `path`, creating its record.
    pub fn set_setup(&mut self, path: &str, remote: Option<RemoteRepo>, setup: SetupConfig) {
        self.add_local(path, remote, None);
        if let Some(r) = self.records.iter_mut().find(|r| r.has_local(path)) {
            r.setup = setup;
        }
    }

    /// Pick the GitHub account for the repo checked out at `path` (None = let
    /// trace work it out), creating its record.
    pub fn set_github_account(
        &mut self,
        path: &str,
        remote: Option<RemoteRepo>,
        login: Option<String>,
    ) {
        self.add_local(path, remote, None);
        if let Some(r) = self.records.iter_mut().find(|r| r.has_local(path)) {
            r.github_account = login;
        }
    }

    /// Drop the checkout at `path`. The record stays while it has a remote, so
    /// its setup comes back if the repo is cloned or added again.
    pub fn forget_local(&mut self, path: &str) {
        for r in &mut self.records {
            r.checkouts.retain(|c| c.local_path() != Some(path));
        }
        self.records
            .retain(|r| !r.checkouts.is_empty() || r.remote.is_some());
    }
}

fn file() -> PathBuf {
    crate::helpers::trace_dir().join("repo-catalog.json")
}

/// The catalog, or an empty one when the file is missing or unreadable (logged).
pub fn load() -> Catalog {
    persist::read_or_log(&file())
}

/// Load, change and save the catalog under its lock.
pub fn update<R>(f: impl FnOnce(&mut Catalog) -> R) -> Result<R, String> {
    persist::update(&file(), Style::Pretty, f)
}

/// `~/src`, where developers most often keep clones.
pub fn default_clone_root() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("src")
        .to_string_lossy()
        .into_owned()
}

/// Where the next clone goes.
pub fn clone_root() -> String {
    load().clone_root.unwrap_or_else(default_clone_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gh(name: &str) -> Option<RemoteRepo> {
        Some(RemoteRepo {
            host: "github.com".into(),
            owner: "o".into(),
            name: name.into(),
        })
    }

    #[test]
    fn a_second_clone_of_a_remote_joins_its_record() {
        let mut cat = Catalog::default();
        cat.add_local("/a/trace", gh("trace"), Some("main".into()));
        cat.add_local("/b/trace", gh("Trace"), None);
        assert_eq!(cat.records.len(), 1);
        assert_eq!(cat.records[0].checkouts.len(), 2);
        assert_eq!(cat.records[0].default_branch.as_deref(), Some("main"));
        // Adding the same path again changes nothing.
        cat.add_local("/a/trace", gh("trace"), None);
        assert_eq!(cat.records[0].checkouts.len(), 2);
    }

    #[test]
    fn setup_survives_removing_a_hosted_repo_but_not_a_local_one() {
        let mut cat = Catalog::default();
        let setup = SetupConfig {
            copy_files: vec![],
            commands: vec!["npm ci".into()],
        };
        cat.set_setup("/a/trace", gh("trace"), setup.clone());
        cat.set_setup("/a/scratch", None, setup.clone());
        assert_eq!(cat.for_path("/a/trace").unwrap().setup, setup);

        cat.forget_local("/a/trace");
        cat.forget_local("/a/scratch");
        assert_eq!(cat.records.len(), 1, "the hosted record is kept");
        assert!(cat.for_path("/a/trace").is_none());

        // Cloned again: the setup is back.
        cat.add_local("/c/trace", gh("trace"), None);
        assert_eq!(cat.for_path("/c/trace").unwrap().setup, setup);
    }
}
