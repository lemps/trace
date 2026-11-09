//! Credentials a sandbox's network adds on the way out, so the tokens never
//! enter the VM. The provider's firewall sits outside the sandbox and sets the
//! header on each matching HTTPS request, overwriting whatever the code inside
//! sent: the agent can *use* GitHub and Claude but can't read the token, print
//! it or carry it off. Inside, the env holds only [`placeholder_env`] values,
//! there so `gh` and `claude` think they're logged in and send a header for
//! the firewall to replace.
//!
//! A provider without this (or a plan without it) falls back to passing the
//! real tokens as env, and the session says so (`host::ready`).

use std::collections::HashMap;
use std::fmt;

use super::SandboxProvider;
use crate::execution::credential::{ClaudeCredential, CredentialKind};
use crate::github::token::Token;

/// What `GH_TOKEN` holds inside a sandbox whose network adds the real one.
pub const GITHUB_PLACEHOLDER: &str = "trace-egress-injects-the-github-token";
/// A Claude OAuth token's shape, for the same reason.
pub const OAUTH_PLACEHOLDER: &str = "sk-ant-oat01-trace-egress-injects-the-real-token";
/// An API key's shape. Its last 20 characters are what Claude Code remembers
/// approving (`script::claude_json`).
pub const API_KEY_PLACEHOLDER: &str = "sk-ant-api03-trace-egress-injects-the-real-key0000";

/// What `ANTHROPIC_AUTH_TOKEN` holds when the network adds a model provider's key.
pub const ENDPOINT_PLACEHOLDER: &str = "trace-egress-injects-the-endpoint-key";

const ENDPOINT_URL: &str = "ANTHROPIC_BASE_URL";
const ENDPOINT_KEY: &str = "ANTHROPIC_AUTH_TOKEN";

/// Headers set on HTTPS requests to one domain: all of them, or only those
/// to one path with one of some methods (a provider's API, for this sandbox's
/// own session and nothing else).
#[derive(Clone, Default, PartialEq, Eq)]
pub struct Injection {
    /// An exact host, or `*.example.com` for its subdomains.
    pub domain: String,
    pub headers: Vec<(String, String)>,
    /// Only requests to exactly this path.
    pub path: Option<String>,
    /// Only requests to paths starting with this one (an MCP server's
    /// endpoint, which may redirect to a trailing slash).
    pub path_prefix: Option<String>,
    /// Only requests with one of these methods; empty for any.
    pub methods: Vec<String>,
}

/// A sandbox's egress: open internet, plus these injections.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct Egress {
    pub injections: Vec<Injection>,
}

impl fmt::Debug for Injection {
    /// The domain, path and header names: the values are the secrets.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let names: Vec<&str> = self.headers.iter().map(|(n, _)| n.as_str()).collect();
        let path = self
            .path
            .as_deref()
            .or(self.path_prefix.as_deref())
            .unwrap_or("");
        write!(f, "{}{path} [{}]", self.domain, names.join(", "))
    }
}

impl fmt::Debug for Egress {
    /// Domains and header names only: the values are the secrets.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let shown: Vec<String> = self.injections.iter().map(|i| format!("{i:?}")).collect();
        write!(f, "Egress({})", shown.join("; "))
    }
}

impl Egress {
    pub fn is_empty(&self) -> bool {
        self.injections.is_empty()
    }

    fn inject(&mut self, domain: &str, name: &str, value: String) {
        self.injections.push(Injection {
            domain: domain.to_string(),
            headers: vec![(name.to_string(), value)],
            ..Injection::default()
        });
    }
}

/// The injections that log a sandbox's agent in.
///
/// - `github.com` gets git's Basic header, so a clone or push is authorised on
///   its first request and git never asks for a password.
/// - `api.github.com` and `uploads.github.com` get the Bearer `gh` sends.
/// - `api.anthropic.com` gets the Claude login, in whichever header its kind uses.
pub fn for_secrets(github: Option<&Token>, claude: Option<&ClaudeCredential>) -> Egress {
    let mut egress = Egress::default();
    if let Some(token) = github {
        egress.inject("github.com", "Authorization", token.basic_header());
        let bearer = format!("Bearer {}", token.expose());
        egress.inject("api.github.com", "Authorization", bearer.clone());
        egress.inject("uploads.github.com", "Authorization", bearer);
    }
    if let Some(c) = claude {
        let (name, value) = match c.kind {
            CredentialKind::OauthToken => ("Authorization", format!("Bearer {}", c.secret())),
            CredentialKind::ApiKey => ("x-api-key", c.secret().to_string()),
        };
        egress.inject("api.anthropic.com", name, value);
    }
    egress
}

/// A model provider's key (Moonshot, Wafer, DeepSeek: `commands::providers`)
/// as an injection for its endpoint's host. Claude Code sends
/// `ANTHROPIC_AUTH_TOKEN` as a Bearer `Authorization`.
pub fn endpoint(launch_env: &HashMap<String, String>) -> Option<Injection> {
    let key = launch_env.get(ENDPOINT_KEY)?;
    let url = reqwest::Url::parse(launch_env.get(ENDPOINT_URL)?).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    Some(Injection {
        domain: url.host_str()?.to_string(),
        headers: vec![("Authorization".to_string(), format!("Bearer {key}"))],
        ..Injection::default()
    })
}

/// The agent's launch env once the network carries its endpoint key: the
/// same, with the key swapped for a placeholder.
pub fn without_endpoint_key(mut env: HashMap<String, String>) -> HashMap<String, String> {
    if let Some(key) = env.get_mut(ENDPOINT_KEY) {
        *key = ENDPOINT_PLACEHOLDER.to_string();
    }
    env
}

/// The env an agent gets when its network injects the real credentials: the
/// same variables, holding placeholders.
pub fn placeholder_env(github: bool, claude: Option<CredentialKind>) -> HashMap<String, String> {
    let mut env = HashMap::new();
    if github {
        env.insert("GH_TOKEN".to_string(), GITHUB_PLACEHOLDER.to_string());
    }
    match claude {
        Some(CredentialKind::OauthToken) => {
            env.insert(
                "CLAUDE_CODE_OAUTH_TOKEN".to_string(),
                OAUTH_PLACEHOLDER.to_string(),
            );
        }
        Some(CredentialKind::ApiKey) => {
            env.insert(
                "ANTHROPIC_API_KEY".to_string(),
                API_KEY_PLACEHOLDER.to_string(),
            );
        }
        None => {}
    }
    env
}

/// How an agent in a sandbox is logged in, once [`apply`] has run.
pub struct Logins {
    /// What goes in its env: placeholders, or the real secrets on the fallback.
    pub env: HashMap<String, String>,
    /// The sandbox's network adds the real credentials; the VM has none.
    pub injected: bool,
}

/// Put the logins in the sandbox's network policy, so the agent's env needs
/// only placeholders. Run on every start (made, resumed or joined), so a
/// token changed in Settings reaches the sandbox. When the provider refuses
/// (its plan, say), the secrets go in the env as before, and `say` tells the
/// user so.
pub fn apply<P: SandboxProvider + ?Sized>(
    provider: &P,
    sandbox: &str,
    session_id: &str,
    github: Option<&Token>,
    claude: Option<&ClaudeCredential>,
    extra: Vec<Injection>,
    say: &dyn Fn(&str),
) -> Logins {
    let mut egress = for_secrets(github, claude);
    egress.injections.extend(extra);
    if egress.is_empty() {
        return Logins {
            env: HashMap::new(),
            injected: false,
        };
    }
    match provider.set_egress(sandbox, session_id, &egress) {
        Ok(()) => Logins {
            env: placeholder_env(github.is_some(), claude.map(|c| c.kind)),
            injected: true,
        },
        Err(e) => {
            let why = crate::github::token::redact(&e, github);
            // Only worth saying when there were logins to keep out.
            let logins = github.is_some() || claude.is_some();
            if logins {
                say(&format!(
                "{} couldn't keep your logins outside the sandbox ({why}), so they're in its environment.",
                provider.label()
            ));
            }
            let mut env = claude.map(ClaudeCredential::env).unwrap_or_default();
            if let Some(token) = github {
                env.insert("GH_TOKEN".to_string(), token.expose().to_string());
            }
            Logins {
                env,
                injected: false,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token() -> Token {
        Token::new("ghp_secret123").expect("token")
    }

    #[test]
    fn github_is_injected_for_git_and_the_api() {
        let e = for_secrets(Some(&token()), None);
        let domains: Vec<&str> = e.injections.iter().map(|i| i.domain.as_str()).collect();
        assert_eq!(
            domains,
            ["github.com", "api.github.com", "uploads.github.com"]
        );
        assert_eq!(e.injections[0].headers[0].1, token().basic_header());
        assert_eq!(e.injections[1].headers[0].1, "Bearer ghp_secret123");
    }

    #[test]
    fn claude_uses_the_header_of_its_kind() {
        let oauth = ClaudeCredential::new(CredentialKind::OauthToken, "sk-ant-oat01-x");
        let e = for_secrets(None, oauth.as_ref());
        assert_eq!(e.injections[0].domain, "api.anthropic.com");
        assert_eq!(
            e.injections[0].headers,
            [(
                "Authorization".to_string(),
                "Bearer sk-ant-oat01-x".to_string()
            )]
        );
        let key = ClaudeCredential::new(CredentialKind::ApiKey, "sk-ant-api03-y");
        let e = for_secrets(None, key.as_ref());
        assert_eq!(e.injections[0].headers[0].0, "x-api-key");
    }

    #[test]
    fn nothing_to_inject_without_secrets() {
        assert!(for_secrets(None, None).is_empty());
    }

    #[test]
    fn debug_shows_header_names_never_values() {
        let e = for_secrets(Some(&token()), None);
        let shown = format!("{e:?}");
        assert!(shown.contains("api.github.com [Authorization]"));
        assert!(!shown.contains("secret123"));
        assert!(!shown.contains(&token().basic_header()));
    }

    #[test]
    fn a_model_providers_key_moves_to_its_host() {
        let env = HashMap::from([
            (
                ENDPOINT_URL.to_string(),
                "https://api.moonshot.ai/anthropic".to_string(),
            ),
            (ENDPOINT_KEY.to_string(), "sk-moon".to_string()),
            ("ANTHROPIC_MODEL".to_string(), "kimi".to_string()),
        ]);
        let i = endpoint(&env).expect("an injection");
        assert_eq!(i.domain, "api.moonshot.ai");
        assert_eq!(i.headers[0].1, "Bearer sk-moon");
        let left = without_endpoint_key(env);
        assert_eq!(left[ENDPOINT_KEY], ENDPOINT_PLACEHOLDER);
        assert_eq!(left["ANTHROPIC_MODEL"], "kimi");
        assert!(endpoint(&HashMap::new()).is_none());
    }

    #[test]
    fn placeholders_stand_in_for_each_secret() {
        let env = placeholder_env(true, Some(CredentialKind::OauthToken));
        assert_eq!(env["GH_TOKEN"], GITHUB_PLACEHOLDER);
        assert_eq!(env["CLAUDE_CODE_OAUTH_TOKEN"], OAUTH_PLACEHOLDER);
        assert!(!env.contains_key("ANTHROPIC_API_KEY"));
        let env = placeholder_env(false, Some(CredentialKind::ApiKey));
        assert_eq!(env.len(), 1);
        assert_eq!(env["ANTHROPIC_API_KEY"], API_KEY_PLACEHOLDER);
    }
}
