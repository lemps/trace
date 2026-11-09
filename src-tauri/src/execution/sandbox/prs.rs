//! The PRs an agent in a sandbox opened, as its `gh` shim reported them
//! (`helpers`, `events`): found by URL, so a PR from a branch the agent named
//! itself is linked too, which the branch lookup (`github::links`) misses.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::helpers::persist::{self, Style};

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("sandbox-prs.json")
}

/// A GitHub PR URL and nothing else: it comes from inside the sandbox.
fn is_pr_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://github.com/") else {
        return false;
    };
    let parts: Vec<&str> = rest.split('/').collect();
    parts.len() == 4
        && parts[2] == "pull"
        && parts[3].chars().all(|c| c.is_ascii_digit())
        && !parts[3].is_empty()
        && parts[..2].iter().all(|p| {
            !p.is_empty()
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        })
}

/// Note that `workspace_id`'s agent opened `url`. Best-effort.
pub fn record(workspace_id: &str, url: &str) {
    if !is_pr_url(url) {
        return;
    }
    let _ = persist::update(
        &path(),
        Style::Compact,
        |map: &mut HashMap<String, Vec<String>>| {
            let urls = map.entry(workspace_id.to_string()).or_default();
            urls.retain(|u| u != url);
            urls.insert(0, url.to_string());
        },
    );
}

/// The PRs `workspace_id`'s agent opened, newest first.
pub fn of(workspace_id: &str) -> Vec<String> {
    persist::read_or_log::<HashMap<String, Vec<String>>>(&path())
        .remove(workspace_id)
        .unwrap_or_default()
}

/// Forget a deleted session's.
pub fn forget(workspace_id: &str) {
    let _ = persist::update(
        &path(),
        Style::Compact,
        |map: &mut HashMap<String, Vec<String>>| {
            map.remove(workspace_id);
        },
    );
}

#[cfg(test)]
mod tests {
    use super::is_pr_url;

    #[test]
    fn only_a_github_pr_url_is_taken() {
        assert!(is_pr_url("https://github.com/noble1911/trace/pull/86"));
        assert!(!is_pr_url("https://github.com/noble1911/trace/pull/"));
        assert!(!is_pr_url("https://github.com/noble1911/trace/issues/86"));
        assert!(!is_pr_url("https://evil.example/noble1911/trace/pull/86"));
        assert!(!is_pr_url("https://github.com/a/b/pull/1/files"));
        assert!(!is_pr_url("https://github.com/a b/c/pull/1"));
    }
}
