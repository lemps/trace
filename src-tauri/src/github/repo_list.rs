//! The repos an owner (the user, or one of their orgs) has on GitHub, from the
//! REST API with trace's token, marked with where each is already checked out.

use serde::Serialize;
use serde_json::Value;

use super::api;
use super::token::Token;
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

/// One REST repository object → a [`GhRepo`]. None without a `full_name`.
fn parse_repo(item: &Value) -> Option<GhRepo> {
    let text = |path: &str| {
        item.pointer(path)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let flag = |key: &str| item.get(key).and_then(Value::as_bool).unwrap_or(false);
    let full_name = text("/full_name")?;
    let (owner, name) = full_name.split_once('/')?;
    Some(GhRepo {
        owner: text("/owner/login").unwrap_or_else(|| owner.to_string()),
        name: text("/name").unwrap_or_else(|| name.to_string()),
        description: text("/description"),
        is_private: flag("private"),
        is_fork: flag("fork"),
        is_archived: flag("archived"),
        url: text("/html_url").unwrap_or_default(),
        default_branch: text("/default_branch"),
        updated_at: text("/pushed_at")
            .or_else(|| text("/updated_at"))
            .unwrap_or_default(),
        language: text("/language"),
        local_path: None,
        full_name,
    })
}

/// Parse the items of a REST repo list (all pages joined).
pub fn parse_repos(items: &[Value]) -> Vec<GhRepo> {
    items.iter().filter_map(parse_repo).collect()
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

/// The `login`s in a REST list of orgs (or users).
pub fn parse_logins(items: &[Value]) -> Vec<String> {
    items
        .iter()
        .filter_map(|o| o.get("login").and_then(Value::as_str))
        .filter(|l| is_login(l))
        .map(str::to_string)
        .collect()
}

/// The path of the first page of `owner`'s repos (the token's own user when None).
pub fn first_page(owner: Option<&str>) -> Result<String, String> {
    match owner {
        None => Ok("/user/repos?affiliation=owner&sort=pushed&per_page=100".into()),
        Some(o) if is_login(o) => Ok(format!("/orgs/{o}/repos?type=all&sort=pushed&per_page=100")),
        Some(o) => Err(format!("{o} isn't a GitHub account name.")),
    }
}

/// `owner`'s repos (the token's own when `None`), most recently pushed first.
pub async fn list(token: &Token, owner: Option<&str>) -> Result<Vec<GhRepo>, String> {
    let items = api::get_all(token, &first_page(owner)?).await?;
    let mut repos = parse_repos(&items);
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(repos)
}

/// The orgs the token can see: `/user/orgs`, plus the owners of org repos it
/// reaches as a member (a fine-grained token may list no orgs but still see
/// their repos). Empty when it can see neither.
pub async fn orgs(token: &Token, login: &str) -> Vec<String> {
    let mut out = match api::get_all(token, "/user/orgs?per_page=100").await {
        Ok(items) => parse_logins(&items),
        Err(_) => Vec::new(),
    };
    let member = "/user/repos?affiliation=organization_member&per_page=100";
    if let Ok(items) = api::get_all(token, member).await {
        for repo in parse_repos(&items) {
            if !repo.owner.eq_ignore_ascii_case(login)
                && !out.iter().any(|o| o.eq_ignore_ascii_case(&repo.owner))
            {
                out.push(repo.owner);
            }
        }
    }
    out
}

/// A GitHub user/org login: letters, digits and inner hyphens, plus `_` for
/// Enterprise Managed Users (`jdoe_acme`). Checked before it goes in a URL or
/// on a command line, so it can never read as a flag or a path.
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

    fn page() -> Vec<Value> {
        serde_json::from_str(
            r#"[
      {"name":"trace","full_name":"noble1911/trace","owner":{"login":"noble1911"},
       "description":"Kanban AI sessions","private":false,"fork":false,"archived":false,
       "html_url":"https://github.com/noble1911/trace","default_branch":"main","size":900,
       "pushed_at":"2026-11-06T21:29:58Z","updated_at":"2026-11-01T00:00:00Z","language":"TypeScript"},
      {"name":"empty","full_name":"noble1911/empty","owner":{"login":"noble1911"},
       "description":"","private":true,"fork":true,"archived":true,"size":0,
       "html_url":"https://github.com/noble1911/empty","default_branch":null,
       "pushed_at":null,"updated_at":"2025-01-01T00:00:00Z","language":null},
      {"name":"broken"}
    ]"#,
        )
        .unwrap()
    }

    #[test]
    fn parses_rest_repos() {
        let repos = parse_repos(&page());
        assert_eq!(repos.len(), 2, "an item without full_name is skipped");
        let t = &repos[0];
        assert_eq!(t.full_name, "noble1911/trace");
        assert_eq!((t.owner.as_str(), t.name.as_str()), ("noble1911", "trace"));
        assert_eq!(t.default_branch.as_deref(), Some("main"));
        assert_eq!(t.language.as_deref(), Some("TypeScript"));
        assert_eq!(t.updated_at, "2026-11-06T21:29:58Z", "last push wins");
        assert!(!t.is_private && !t.is_fork && !t.is_archived);
        let e = &repos[1];
        assert_eq!(e.default_branch, None);
        assert_eq!(e.description, None);
        assert_eq!(e.updated_at, "2025-01-01T00:00:00Z");
        assert!(e.is_private && e.is_fork && e.is_archived);
    }

    #[test]
    fn pages_join_into_one_list() {
        let mut both = page();
        both.extend(page());
        assert_eq!(parse_repos(&both).len(), 4);
    }

    #[test]
    fn first_pages() {
        assert!(first_page(None).unwrap().starts_with("/user/repos?"));
        assert_eq!(
            first_page(Some("acme")).unwrap(),
            "/orgs/acme/repos?type=all&sort=pushed&per_page=100"
        );
        assert!(first_page(Some("../user")).is_err());
    }

    #[test]
    fn marks_repos_already_checked_out() {
        let mut repos = parse_repos(&page());
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
    fn org_logins_and_login_rules() {
        let orgs: Vec<Value> =
            serde_json::from_str(r#"[{"login":"acme"},{"login":"beta-co"},{"login":"-bad"},{}]"#)
                .unwrap();
        assert_eq!(parse_logins(&orgs), vec!["acme", "beta-co"]);
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
