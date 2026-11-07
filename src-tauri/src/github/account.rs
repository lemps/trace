//! Who trace is signed in to GitHub as, with its own token (`token`): checking
//! a token against `GET /user`, and the ways to get one (paste, a one-off
//! import from `gh`, the OAuth device flow in `device`).

use serde::Serialize;

use super::api;
use super::token::{self, Credential, Source, Token};

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

/// The saved token's state. Never errors: signed out, or a token GitHub
/// refuses, is a state to show.
pub async fn status() -> GitHubStatus {
    let Some(cred) = token::load() else {
        return base();
    };
    let mut s = GitHubStatus {
        login: Some(cred.login.clone()),
        source: Some(cred.source),
        ..base()
    };
    match validate(&cred.token).await {
        Ok(info) => {
            s.login = Some(info.login);
            s.scopes = info.scopes;
            s.expires_at = info.expires_at;
        }
        Err(e) => s.problem = Some(e),
    }
    s
}

/// Check `token`, then save it as trace's GitHub credential.
pub async fn sign_in(token: Token, source: Source) -> Result<GitHubStatus, String> {
    let info = validate(&token).await?;
    token::save(&Credential {
        token,
        source,
        login: info.login.clone(),
    })?;
    Ok(GitHubStatus {
        login: Some(info.login),
        source: Some(source),
        scopes: info.scopes,
        expires_at: info.expires_at,
        ..base()
    })
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
    token::load()
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
