//! The Claude login a remote host's agents get. Sandboxes don't have this
//! machine's Claude login, so the user picks one: an OAuth token from
//! `claude setup-token` (the default), an API key, or none, in which case they
//! run `/login` inside the session.
//!
//! Kept in a user-only (`0600`) file like the tracker credentials. The secret
//! reaches a sandbox only as an environment variable at spawn: never the
//! renderer, a log, a label or a command line.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};
use crate::helpers::trace_dir;

/// Which kind of Claude login.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CredentialKind {
    OauthToken,
    ApiKey,
}

impl CredentialKind {
    /// Read the renderer's name for it.
    pub fn parse(kind: &str) -> Option<CredentialKind> {
        match kind {
            "oauthToken" => Some(CredentialKind::OauthToken),
            "apiKey" => Some(CredentialKind::ApiKey),
            _ => None,
        }
    }

    /// The variable Claude Code reads it from.
    fn env_var(self) -> &'static str {
        match self {
            CredentialKind::OauthToken => "CLAUDE_CODE_OAUTH_TOKEN",
            CredentialKind::ApiKey => "ANTHROPIC_API_KEY",
        }
    }
}

/// A saved Claude login. Never serialized toward the renderer.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCredential {
    pub kind: CredentialKind,
    secret: String,
}

impl std::fmt::Debug for ClaudeCredential {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ClaudeCredential({:?}, <redacted>)", self.kind)
    }
}

impl ClaudeCredential {
    /// A pasted secret, trimmed. None when it's blank or has whitespace inside,
    /// which no token or key does (a paste of something else).
    pub fn new(kind: CredentialKind, raw: &str) -> Option<ClaudeCredential> {
        let secret = raw.trim();
        if secret.is_empty() || secret.chars().any(char::is_whitespace) {
            return None;
        }
        Some(ClaudeCredential {
            kind,
            secret: secret.to_string(),
        })
    }

    /// The environment that logs an agent in.
    pub fn env(&self) -> HashMap<String, String> {
        HashMap::from([(self.kind.env_var().to_string(), self.secret.clone())])
    }

    /// What Claude Code keeps to remember it accepted an API key without asking
    /// again: the key's last 20 characters. Nothing for an OAuth token.
    pub fn approved_key_suffix(&self) -> Option<String> {
        (self.kind == CredentialKind::ApiKey).then(|| {
            let skip = self.secret.chars().count().saturating_sub(20);
            self.secret.chars().skip(skip).collect()
        })
    }
}

fn path() -> PathBuf {
    trace_dir().join("claude-credential.json")
}

/// The saved login, if any.
pub fn load() -> Option<ClaudeCredential> {
    persist::read_or_log::<Option<ClaudeCredential>>(&path())
}

pub fn save(credential: &ClaudeCredential) -> Result<(), String> {
    persist::write_json(&path(), Style::Compact, credential)
}

pub fn clear() {
    persist::remove(&path());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_paste_is_trimmed_and_junk_is_refused() {
        let c = ClaudeCredential::new(CredentialKind::OauthToken, "  sk-ant-oat01-abc\n");
        assert_eq!(
            c.map(|c| c.env()),
            Some(HashMap::from([(
                "CLAUDE_CODE_OAUTH_TOKEN".to_string(),
                "sk-ant-oat01-abc".to_string()
            )]))
        );
        assert!(ClaudeCredential::new(CredentialKind::ApiKey, "   ").is_none());
        assert!(ClaudeCredential::new(CredentialKind::ApiKey, "two words").is_none());
    }

    #[test]
    fn debug_never_shows_the_secret() {
        let c = ClaudeCredential::new(CredentialKind::ApiKey, "sk-ant-api03-secret");
        assert!(!format!("{c:?}").contains("secret"));
    }

    #[test]
    fn only_an_api_key_has_an_approval_suffix() {
        let key = format!("sk-ant-api03-{}", "x".repeat(30));
        let api = ClaudeCredential::new(CredentialKind::ApiKey, &key);
        assert_eq!(
            api.and_then(|c| c.approved_key_suffix()),
            Some("x".repeat(20))
        );
        let oauth = ClaudeCredential::new(CredentialKind::OauthToken, "sk-ant-oat01-abc");
        assert_eq!(oauth.and_then(|c| c.approved_key_suffix()), None);
    }

    #[test]
    fn kinds_read_the_renderer_names() {
        assert_eq!(
            CredentialKind::parse("oauthToken"),
            Some(CredentialKind::OauthToken)
        );
        assert_eq!(
            CredentialKind::parse("apiKey"),
            Some(CredentialKind::ApiKey)
        );
        assert_eq!(CredentialKind::parse("password"), None);
    }
}
