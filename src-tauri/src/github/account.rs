//! Who trace is signed in to GitHub as, with its own token (`token`): checking
//! a token against `GET /user`, and the ways to get one (paste, a one-off
//! import from `gh`, the OAuth device flow in `device`).

use serde::Serialize;

use super::accounts::{self, Credential, Source};
use super::api;
use super::token::Token;

/// The GitHub integration's state, for its card and dialog. Never holds the token.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStatus {
    /// The account trace's token belongs to.
    pub login: Option<String>,
    pub source: Option<Source>,
    /// A classic or OAuth token's scopes (`X-OAuth-Scopes`). None for a
    /// fine-grained token, whose permissions GitHub doesn't report.
    pub scopes: Option<Vec<String>>,
    /// When the token expires, as GitHub reports it.
    pub expires_at: Option<String>,
    /// `gh` is installed, so "Use my gh login" can import its token.
    pub gh_available: bool,
    /// The OAuth device flow is configured (`device::CLIENT_ID`).
    pub device_flow: bool,
    /// Why the saved token isn't working right now.
    pub problem: Option<String>,
    /// Every signed-in account, the primary (the one above) first.
    pub accounts: Vec<AccountSummary>,
}

/// One signed-in account, for the dialog's list. Never holds the token.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    pub login: String,
    pub source: Source,
    /// What the repo browser and other single-account features use.
    pub primary: bool,
    /// Why its token isn't working right now.
    pub problem: Option<String>,
}

/// What `GET /user` says about a token.
#[derive(Debug, PartialEq)]
pub struct TokenInfo {
    pub login: String,
    pub scopes: Option<Vec<String>>,
    pub expires_at: Option<String>,
}

/// `X-OAuth-Scopes: repo, read:org` → its scopes. A header that's absent
/// (fine-grained tokens) is None; present but empty is no scopes.
pub fn parse_scopes(header: Option<&str>) -> Option<Vec<String>> {
    header.map(|h| {
        h.split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect()
    })
}

/// Check `token` with `GET /user`.
pub async fn validate(token: &Token) -> Result<TokenInfo, String> {
    let resp = api::get(token, "/user").await?;
    let login = resp
        .body
        .get("login")
        .and_then(|v| v.as_str())
        .filter(|l| !l.is_empty())
        .ok_or("GitHub didn't say whose token this is.")?
        .to_string();
    Ok(TokenInfo {
        login,
        scopes: parse_scopes(resp.header("x-oauth-scopes").as_deref()),
        expires_at: resp
            .header("github-authentication-token-expiration")
            .filter(|s| !s.trim().is_empty()),
    })
}

fn base() -> GitHubStatus {
    GitHubStatus {
        gh_available: crate::claude::discovery::find_cli_with_env("gh", None).is_some(),
        device_flow: super::device::enabled(),
        ..GitHubStatus::default()
    }
}

/// The signed-in accounts' state. Never errors: signed out, or a token GitHub
/// refuses, is a state to show. The top-level fields describe the primary.
pub async fn status() -> GitHubStatus {
    let all = accounts::load_all();
    let mut s = base();
    for (i, cred) in all.iter().enumerate() {
        let checked = validate(&cred.token).await;
        if i == 0 {
            s.login = Some(cred.login.clone());
            s.source = Some(cred.source);
            match &checked {
                Ok(info) => {
                    s.scopes = info.scopes.clone();
                    s.expires_at = info.expires_at.clone();
                }
                Err(e) => s.problem = Some(e.clone()),
            }
        }
        s.accounts.push(AccountSummary {
            login: checked
                .as_ref()
                .map_or(cred.login.clone(), |info| info.login.clone()),
            source: cred.source,
            primary: i == 0,
            problem: checked.err(),
        });
    }
    s
}

/// Check `token`, then add it as one of trace's GitHub accounts (replacing the
/// token of an account already signed in).
pub async fn add(token: Token, source: Source) -> Result<(), String> {
    let info = validate(&token).await?;
    accounts::save(&Credential {
        token,
        source,
        login: info.login,
    })
}

/// [`add`], then the accounts' state.
pub async fn sign_in(token: Token, source: Source) -> Result<GitHubStatus, String> {
    add(token, source).await?;
    Ok(status().await)
}

/// Every account `gh` is signed in to on github.com, each token copied once.
/// Falls back to `gh`'s active account on a `gh` too old to list them.
pub fn gh_tokens() -> Result<Vec<Token>, String> {
    let tokens: Vec<Token> = super::gh::logins()
        .iter()
        .filter_map(|login| super::gh::token_for(login))
        .filter_map(|t| Token::new(&t))
        .collect();
    if tokens.is_empty() {
        return gh_token().map(|t| vec![t]);
    }
    Ok(tokens)
}

/// The token `gh` is signed in with on github.com, copied once. After this
/// trace doesn't need `gh` for the integration.
pub fn gh_token() -> Result<Token, String> {
    if crate::claude::discovery::find_cli_with_env("gh", None).is_none() {
        return Err("The GitHub CLI (gh) isn't installed.".into());
    }
    let out = crate::claude::discovery::command("gh")
        .args(["auth", "token", "--hostname", "github.com"])
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("Couldn't run gh: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    match (out.status.success(), Token::new(&text)) {
        (true, Some(t)) => Ok(t),
        // stderr only: stdout could hold a token even on failure.
        _ => Err(format!(
            "gh isn't signed in to github.com ({}). Run `gh auth login`, or paste a token instead.",
            String::from_utf8_lossy(&out.stderr).trim()
        )),
    }
}

/// The signed-in credential's token, or why there isn't one.
pub fn require_token() -> Result<Token, String> {
    accounts::load()
        .map(|c| c.token)
        .ok_or_else(|| "Sign in to GitHub first (Integrations → GitHub).".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scopes_header() {
        assert_eq!(
            parse_scopes(Some("repo, read:org,  workflow")),
            Some(vec!["repo".into(), "read:org".into(), "workflow".into()])
        );
        assert_eq!(parse_scopes(Some("")), Some(vec![]));
        assert_eq!(parse_scopes(None), None, "fine-grained tokens report none");
    }

    #[test]
    fn status_serializes_without_a_token_field() {
        let s = GitHubStatus {
            login: Some("me".into()),
            source: Some(Source::Gh),
            ..GitHubStatus::default()
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains(r#""source":"gh""#), "{json}");
        assert!(!json.to_lowercase().contains("token"), "{json}");
    }
}
