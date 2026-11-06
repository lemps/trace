//! The repos an owner (the user, or one of their orgs) has on GitHub, from
//! `gh repo list`, marked with where each is already checked out.

use serde::Serialize;
use serde_json::Value;

use crate::repo_catalog::model::RemoteRepo;

/// One repo, as the browser lists it.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GhRepo {
    /// `owner/name`.
    pub full_name: String,
    pub owner: String,
    pub name: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub is_fork: bool,
    pub is_archived: bool,
    pub url: String,
    pub default_branch: Option<String>,
    /// ISO 8601.
    pub updated_at: String,
    pub language: Option<String>,
    /// The configured repo that is a checkout of it, if any.
    pub local_path: Option<String>,
}

/// The `--json` fields [`parse_repo_list`] reads.
const FIELDS: &str = "name,nameWithOwner,owner,description,isPrivate,isFork,isArchived,url,\
defaultBranchRef,updatedAt,primaryLanguage";

/// gh's own cap is 1000, more than anyone browses by scrolling; search narrows it.
const LIMIT: &str = "1000";

/// Parse `gh repo list --json <FIELDS>`.
pub fn parse_repo_list(json: &str) -> Result<Vec<GhRepo>, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("Unexpected gh output: {e}"))?;
    let items = v.as_array().ok_or("Unexpected gh output: not a list")?;
    let text = |item: &Value, path: &str| {
        item.pointer(path)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let flag = |item: &Value, key: &str| item.get(key).and_then(Value::as_bool).unwrap_or(false);
    Ok(items
        .iter()
        .filter_map(|item| {
            let full_name = text(item, "/nameWithOwner")?;
            let (owner, name) = full_name.split_once('/')?;
            Some(GhRepo {
                owner: text(item, "/owner/login").unwrap_or_else(|| owner.to_string()),
                name: text(item, "/name").unwrap_or_else(|| name.to_string()),
                description: text(item, "/description"),
                is_private: flag(item, "isPrivate"),
                is_fork: flag(item, "isFork"),
                is_archived: flag(item, "isArchived"),
                url: text(item, "/url").unwrap_or_default(),
                default_branch: text(item, "/defaultBranchRef/name"),
                updated_at: text(item, "/updatedAt").unwrap_or_default(),
                language: text(item, "/primaryLanguage/name"),
                local_path: None,
                full_name,
            })
        })
        .collect())
}

/// Set `local_path` on each repo that one of `known` (remote, checkout) is a clone of.
pub fn mark_local(repos: &mut [GhRepo], known: &[(RemoteRepo, String)]) {
    for repo in repos {
        repo.local_path = known
            .iter()
            .find(|(remote, _)| {
                remote.host == "github.com"
                    && remote.full_name().eq_ignore_ascii_case(&repo.full_name)
            })
            .map(|(_, path)| path.clone());
    }
}

/// Org logins from `gh api user/orgs --jq '.[].login'`, one per line.
pub fn parse_org_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

fn gh(args: &[&str]) -> Result<String, String> {
    let mut cmd = crate::claude::discovery::command("gh");
    cmd.args(args);
    if let Some(home) = dirs::home_dir() {
        // Not inside some repo, where gh would infer one.
        cmd.current_dir(home);
    }
    let out = cmd.output().map_err(|e| format!("Couldn't run gh: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `owner`'s repos (the active account's own when `None`), most recently updated first.
pub fn list(owner: Option<&str>) -> Result<Vec<GhRepo>, String> {
    let mut args = vec!["repo", "list"];
    if let Some(owner) = owner {
        if !is_login(owner) {
            return Err(format!("{owner} isn't a GitHub account name."));
        }
        args.push(owner);
    }
    args.extend(["--limit", LIMIT, "--json", FIELDS]);
    let mut repos = parse_repo_list(&gh(&args)?)?;
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(repos)
}

/// The orgs the active account belongs to. Empty if gh lacks `read:org`.
pub fn orgs() -> Vec<String> {
    gh(&["api", "user/orgs", "--paginate", "--jq", ".[].login"])
        .map(|t| parse_org_lines(&t))
        .unwrap_or_default()
}

/// A GitHub user/org login: letters, digits and inner hyphens, plus `_` for
/// Enterprise Managed Users (`jdoe_acme`). Checked before it goes on a command
/// line, so it can never read as a flag.
pub fn is_login(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && !s.starts_with('-')
        && !s.ends_with('-')
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = r#"[
      {"defaultBranchRef":{"name":"main"},"description":"Kanban AI sessions","isArchived":false,
       "isFork":false,"isPrivate":false,"name":"trace","nameWithOwner":"noble1911/trace",
       "owner":{"id":"X","login":"noble1911"},"primaryLanguage":{"name":"TypeScript"},
       "updatedAt":"2026-11-06T21:29:58Z","url":"https://github.com/noble1911/trace"},
      {"defaultBranchRef":null,"description":"","isArchived":true,"isFork":true,"isPrivate":true,
       "name":"empty","nameWithOwner":"noble1911/empty","owner":{"login":"noble1911"},
       "primaryLanguage":null,"updatedAt":"2025-01-01T00:00:00Z","url":"https://github.com/noble1911/empty"},
      {"name":"broken"}
    ]"#;

    #[test]
    fn parses_gh_repo_list_json() {
        let repos = parse_repo_list(LIST).unwrap();
        assert_eq!(repos.len(), 2, "an item without nameWithOwner is skipped");
        let t = &repos[0];
        assert_eq!(t.full_name, "noble1911/trace");
        assert_eq!((t.owner.as_str(), t.name.as_str()), ("noble1911", "trace"));
        assert_eq!(t.default_branch.as_deref(), Some("main"));
        assert_eq!(t.language.as_deref(), Some("TypeScript"));
        assert_eq!(t.description.as_deref(), Some("Kanban AI sessions"));
        assert!(!t.is_private && !t.is_fork && !t.is_archived);
        // An empty repo has no default branch; an empty description is none.
        let e = &repos[1];
        assert_eq!(e.default_branch, None);
        assert_eq!(e.description, None);
        assert_eq!(e.language, None);
        assert!(e.is_private && e.is_fork && e.is_archived);
    }

    #[test]
    fn rejects_non_list_output() {
        assert!(parse_repo_list(r#"{"message":"nope"}"#).is_err());
        assert!(parse_repo_list("could not connect").is_err());
        assert_eq!(parse_repo_list("[]").unwrap(), vec![]);
    }

    #[test]
    fn marks_repos_already_checked_out() {
        let mut repos = parse_repo_list(LIST).unwrap();
        let remote = |host: &str, owner: &str, name: &str| RemoteRepo {
            host: host.into(),
            owner: owner.into(),
            name: name.into(),
        };
        let known = vec![
            (
                remote("github.com", "Noble1911", "Trace"),
                r"C:\src\trace".to_string(),
            ),
            (
                remote("gitlab.com", "noble1911", "empty"),
                "/src/empty".to_string(),
            ),
        ];
        mark_local(&mut repos, &known);
        assert_eq!(repos[0].local_path.as_deref(), Some(r"C:\src\trace"));
        assert_eq!(
            repos[1].local_path, None,
            "same name on another host isn't it"
        );
    }

    #[test]
    fn org_lines_and_logins() {
        assert_eq!(
            parse_org_lines("acme\n\n  beta-co \n"),
            vec!["acme", "beta-co"]
        );
        assert!(is_login("noble1911") && is_login("beta-co"));
        assert!(
            is_login("jdoe_acme"),
            "Enterprise Managed User logins have an underscore"
        );
        for bad in ["", "-x", "x-", "a/b", "--limit", "a b"] {
            assert!(!is_login(bad), "{bad}");
        }
    }
}
