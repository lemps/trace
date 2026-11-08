//! What trace knows about a repository, apart from *where* agents run it.
//!
//! A repo is identified by its remote when it has one (`github.com/owner/name`),
//! and has any number of checkouts. Today every checkout is a local folder, and
//! `repos.json` lists those folders for agents to run in. Remote execution (the
//! roadmap's Cloud VMs) adds another [`Checkout`] variant for the same record,
//! so a repo's setup and identity don't change when it moves off this machine.

use serde::{Deserialize, Serialize};

/// The repo on its code host. `owner` can hold nested groups (GitLab), so it is
/// everything before the last path segment.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRepo {
    /// e.g. `github.com`.
    pub host: String,
    pub owner: String,
    pub name: String,
}

impl RemoteRepo {
    /// `owner/name`, the form `gh` takes.
    pub fn full_name(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }

    /// Whether `other` names the same repo. Hosts and GitHub names are
    /// case-insensitive, so `Org/Repo` and `org/repo` are one repo.
    pub fn same_as(&self, other: &RemoteRepo) -> bool {
        // A record saved before SSH aliases were read as GitHub keeps the alias.
        let canon = |h: &str| {
            if alias_account(&h.to_ascii_lowercase()).is_some() {
                GITHUB_HOST.to_string()
            } else {
                h.to_ascii_lowercase()
            }
        };
        canon(&self.host) == canon(&other.host)
            && self.full_name().eq_ignore_ascii_case(&other.full_name())
    }
}

/// One place a repo is checked out. Tagged, so a later `cloud` kind slots in
/// beside `local` without migrating the file.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Checkout {
    /// A clone on this machine; its path is the repo's entry in `repos.json`.
    Local { path: String },
}

impl Checkout {
    /// The folder, for a checkout on this machine.
    pub fn local_path(&self) -> Option<&str> {
        match self {
            Checkout::Local { path } => Some(path),
        }
    }
}

/// What makes a fresh worktree ready for an agent (the roadmap's "Worktree setup
/// hooks"). Runs once, right after trace creates the worktree.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SetupConfig {
    /// Files copied from the repo's main checkout first — untracked ones like
    /// `.env` that a new worktree doesn't get. Paths relative to the repo root.
    #[serde(default)]
    pub copy_files: Vec<String>,
    /// Shell command lines run in order in the new worktree; the first failure stops.
    #[serde(default)]
    pub commands: Vec<String>,
}

impl SetupConfig {
    /// Nothing to do.
    pub fn is_empty(&self) -> bool {
        self.copy_files.is_empty() && self.commands.is_empty()
    }

    /// Trimmed, without blanks or duplicates, and with only copy paths that stay
    /// inside the repo — a setup can't reach outside the checkout it copies from.
    pub fn sanitized(self) -> Result<SetupConfig, String> {
        let clean = |items: Vec<String>| {
            let mut out: Vec<String> = Vec::new();
            for item in items.into_iter().map(|s| s.trim().to_string()) {
                if !item.is_empty() && !out.contains(&item) {
                    out.push(item);
                }
            }
            out
        };
        let copy_files = clean(self.copy_files);
        if let Some(bad) = copy_files.iter().find(|p| !is_inside_relative(p)) {
            return Err(format!(
                "{bad} isn't a path inside the repository — use one like .env or config/local.json."
            ));
        }
        Ok(SetupConfig {
            copy_files,
            commands: clean(self.commands),
        })
    }
}

/// A relative path that can't climb out of its base: no root, drive or `..`.
pub fn is_inside_relative(path: &str) -> bool {
    let p = path.replace('\\', "/");
    !p.is_empty()
        && !p.starts_with('/')
        && !p.contains(':')
        && p.split('/').all(|seg| seg != ".." && !seg.is_empty())
}

/// Everything recorded about one repo.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoRecord {
    /// None for a repo with no (parseable) origin.
    #[serde(default)]
    pub remote: Option<RemoteRepo>,
    #[serde(default)]
    pub checkouts: Vec<Checkout>,
    /// Detected at clone time; agents still re-read origin/HEAD per worktree.
    #[serde(default)]
    pub default_branch: Option<String>,
    #[serde(default)]
    pub setup: SetupConfig,
    /// The GitHub account a cloud sandbox clones and pushes this repo as, when
    /// the user picked one (`github::pick`); None = work it out.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub github_account: Option<String>,
}

impl RepoRecord {
    /// Whether this record has a local checkout at `path`.
    pub fn has_local(&self, path: &str) -> bool {
        self.checkouts.iter().any(|c| c.local_path() == Some(path))
    }
}

/// Parse a git remote URL into host/owner/name. `None` for local paths and
/// anything without both an owner and a name.
///
/// Handles scp-style (`git@github.com:o/n.git`), `ssh://` (with user and port)
/// and `https://` (with credentials, `.git` and a trailing slash). A per-account
/// SSH alias (`github.com-work`, set up in `~/.ssh/config` to use several GitHub
/// accounts) is still github.com: see [`github_alias_account`].
pub fn parse_remote_url(url: &str) -> Option<RemoteRepo> {
    let url = url.trim();
    let (host, path) = if let Some((_, rest)) = url.split_once("://") {
        let (authority, path) = rest.split_once('/')?;
        let host = authority.rsplit('@').next()?;
        let host = host.split(':').next()?;
        (host, path)
    } else {
        // scp-like: [user@]host:path — but never a Windows drive (`C:\…`).
        let (left, path) = url.split_once(':')?;
        if left.len() == 1 || left.contains('/') || left.contains('\\') {
            return None;
        }
        (left.rsplit('@').next()?, path)
    };
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.rsplit_once('/')?;
    if host.is_empty() || owner.is_empty() || name.is_empty() {
        return None;
    }
    let host = host.to_ascii_lowercase();
    let host = if alias_account(&host).is_some() {
        GITHUB_HOST.to_string()
    } else {
        host
    };
    Some(RemoteRepo {
        host,
        owner: owner.to_string(),
        name: name.to_string(),
    })
}

const GITHUB_HOST: &str = "github.com";

fn alias_account(host: &str) -> Option<&str> {
    host.strip_prefix("github.com-").filter(|a| !a.is_empty())
}

/// The GitHub account a remote URL's SSH alias names (`github.com-noble1911` →
/// `noble1911`): which of several signed-in accounts this checkout pushes as.
pub fn github_alias_account(url: &str) -> Option<String> {
    let url = url.trim();
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let authority = rest.split(['/', ':']).next()?;
    let host = authority.rsplit('@').next()?.to_ascii_lowercase();
    alias_account(&host).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote(host: &str, owner: &str, name: &str) -> Option<RemoteRepo> {
        Some(RemoteRepo {
            host: host.into(),
            owner: owner.into(),
            name: name.into(),
        })
    }

    #[test]
    fn parses_the_remote_forms_git_and_gh_write() {
        let want = remote("github.com", "noble1911", "trace");
        assert_eq!(parse_remote_url("git@github.com:noble1911/trace.git"), want);
        assert_eq!(parse_remote_url("https://github.com/noble1911/trace"), want);
        assert_eq!(
            parse_remote_url("https://github.com/noble1911/trace.git\n"),
            want
        );
        assert_eq!(
            parse_remote_url("https://github.com/noble1911/trace/"),
            want
        );
        assert_eq!(
            parse_remote_url("ssh://git@github.com/noble1911/trace.git"),
            want
        );
        assert_eq!(
            parse_remote_url("ssh://git@GitHub.com:22/noble1911/trace"),
            want
        );
        assert_eq!(
            parse_remote_url("https://x:tok@github.com/noble1911/trace"),
            want
        );
    }

    #[test]
    fn a_per_account_ssh_alias_is_still_github() {
        let url = "git@github.com-noble1911:noble1911/trace.git";
        assert_eq!(
            parse_remote_url(url),
            remote("github.com", "noble1911", "trace")
        );
        assert_eq!(github_alias_account(url).as_deref(), Some("noble1911"));
        assert_eq!(
            github_alias_account("ssh://git@github.com-work/o/n.git").as_deref(),
            Some("work")
        );
        assert_eq!(
            github_alias_account("git@github.com:noble1911/trace.git"),
            None
        );
        assert_eq!(github_alias_account("https://github.com/o/n"), None);
    }

    #[test]
    fn nested_groups_stay_in_the_owner() {
        assert_eq!(
            parse_remote_url("git@gitlab.com:group/sub/repo.git"),
            remote("gitlab.com", "group/sub", "repo")
        );
    }

    #[test]
    fn local_paths_and_junk_are_not_remotes() {
        assert_eq!(parse_remote_url(r"C:\src\trace"), None);
        assert_eq!(parse_remote_url("/home/me/trace"), None);
        assert_eq!(parse_remote_url("../trace"), None);
        assert_eq!(parse_remote_url("https://github.com/onlyowner"), None);
        assert_eq!(parse_remote_url(""), None);
    }

    #[test]
    fn same_repo_ignores_case() {
        let a = remote("github.com", "Org", "Repo").unwrap();
        let b = remote("github.com", "org", "repo").unwrap();
        assert!(a.same_as(&b));
        assert!(!a.same_as(&remote("github.com", "org", "other").unwrap()));
    }

    #[test]
    fn setup_is_trimmed_deduped_and_kept_inside_the_repo() {
        let setup = SetupConfig {
            copy_files: vec![
                " .env ".into(),
                ".env".into(),
                "".into(),
                "config/a.json".into(),
            ],
            commands: vec!["npm install".into(), "  ".into()],
        }
        .sanitized()
        .unwrap();
        assert_eq!(setup.copy_files, vec![".env", "config/a.json"]);
        assert_eq!(setup.commands, vec!["npm install"]);
        for bad in ["../secrets", "/etc/passwd", r"C:\x", r"a\..\..\b", "a//b"] {
            let cfg = SetupConfig {
                copy_files: vec![bad.into()],
                commands: vec![],
            };
            assert!(cfg.sanitized().is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn checkout_is_tagged_for_future_kinds() {
        let c = Checkout::Local { path: "/r".into() };
        let json = serde_json::to_string(&c).unwrap();
        assert_eq!(json, r#"{"kind":"local","path":"/r"}"#);
    }
}
