//! trace's own GitHub token: the credential every GitHub call (and, later, a
//! remote sandbox) uses, so nothing depends on a local `gh` login.
//!
//! Stored like the Jira and Pylon credentials: a JSON file in the config dir,
//! written atomically and user-only from creation (`helpers::persist`; `0600` on
//! Unix, an owner-only ACL on Windows, inside a config dir that is itself
//! restricted). Never logged, emitted or returned to the renderer: [`Token`]
//! has no `Serialize` and a redacted `Debug`, and every error that might echo
//! it goes through [`redact`].

use std::fmt;
use std::path::PathBuf;

use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

/// A GitHub access token. Only [`Token::expose`] gives the text out.
#[derive(Clone, PartialEq, Eq)]
pub struct Token(String);

impl Token {
    /// A pasted or imported token, trimmed. None when blank or when it holds
    /// whitespace inside (a paste of something else), which no token does.
    pub fn new(raw: &str) -> Option<Token> {
        let t = raw.trim();
        if t.is_empty() || t.len() > 1024 || t.chars().any(|c| c.is_whitespace() || c.is_control())
        {
            return None;
        }
        Some(Token(t.to_string()))
    }

    /// The token itself, for an `Authorization` header and nothing else.
    pub fn expose(&self) -> &str {
        &self.0
    }

    /// The value of an HTTP Basic `Authorization` header git sends for it:
    /// `Basic base64(x-access-token:<token>)`, which GitHub accepts for every
    /// token kind (classic, fine-grained, OAuth).
    pub fn basic_header(&self) -> String {
        let pair = format!("x-access-token:{}", self.0);
        format!(
            "Basic {}",
            base64::engine::general_purpose::STANDARD.encode(pair)
        )
    }

    /// Every form the token could show up in, for [`redact`].
    pub fn forms(&self) -> Vec<String> {
        let b64 = self.basic_header().trim_start_matches("Basic ").to_string();
        vec![self.0.clone(), b64]
    }
}

impl fmt::Debug for Token {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Token(<redacted>)")
    }
}

/// `text` with every form of `token` replaced, so an error that quotes a
/// command, URL or header can be shown or logged.
pub fn redact(text: &str, token: Option<&Token>) -> String {
    let Some(token) = token else {
        return text.to_string();
    };
    token
        .forms()
        .iter()
        .filter(|f| !f.is_empty())
        .fold(text.to_string(), |acc, f| acc.replace(f.as_str(), "***"))
}

/// How trace got the token.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// A personal access token the user pasted.
    Pasted,
    /// Copied once from `gh auth token`.
    Gh,
    /// OAuth device flow.
    Device,
}

/// The file's contents. `login` is kept so the card can say who is signed in
/// while GitHub is unreachable.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    token: String,
    source: Source,
    login: String,
}

/// A loaded credential.
#[derive(Clone, Debug)]
pub struct Credential {
    pub token: Token,
    pub source: Source,
    pub login: String,
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("github-token.json")
}

/// Persist `cred`, replacing any earlier one.
pub fn save(cred: &Credential) -> Result<(), String> {
    save_at(&path(), cred)
}

/// The saved credential, if any. An unreadable file reads as signed out.
pub fn load() -> Option<Credential> {
    load_at(&path())
}

/// Forget the token.
pub fn clear() -> Result<(), String> {
    clear_at(&path())
}

fn save_at(path: &std::path::Path, cred: &Credential) -> Result<(), String> {
    persist::write_json(
        path,
        Style::Compact,
        &Stored {
            token: cred.token.expose().to_string(),
            source: cred.source,
            login: cred.login.clone(),
        },
    )
}

fn load_at(path: &std::path::Path) -> Option<Credential> {
    let s = persist::read_or_log::<Option<Stored>>(path)?;
    Some(Credential {
        token: Token::new(&s.token)?,
        source: s.source,
        login: s.login,
    })
}

fn clear_at(path: &std::path::Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Couldn't remove the GitHub token: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_are_trimmed_and_junk_refused() {
        assert_eq!(Token::new("  ghp_abc\n").unwrap().expose(), "ghp_abc");
        for bad in ["", "   ", "ghp_a b", "a\tb"] {
            assert!(Token::new(bad).is_none(), "{bad:?}");
        }
    }

    #[test]
    fn debug_never_shows_the_token() {
        let t = Token::new("ghp_SECRET123").unwrap();
        let cred = Credential {
            token: t.clone(),
            source: Source::Pasted,
            login: "me".into(),
        };
        assert!(!format!("{t:?} {cred:?}").contains("SECRET"));
    }

    #[test]
    fn redact_removes_raw_and_basic_forms() {
        let t = Token::new("ghp_SECRET123").unwrap();
        let header = t.basic_header();
        let text = format!(
            "fatal: https://x-access-token:ghp_SECRET123@github.com/o/r failed; header {header}"
        );
        let out = redact(&text, Some(&t));
        assert!(!out.contains("ghp_SECRET123"), "{out}");
        let b64 = header.trim_start_matches("Basic ");
        assert!(!out.contains(b64), "{out}");
        assert!(out.contains("github.com/o/r"));
        assert_eq!(redact("plain", None), "plain");
    }

    #[test]
    fn basic_header_is_x_access_token() {
        let h = Token::new("abc").unwrap().basic_header();
        let raw = base64::engine::general_purpose::STANDARD
            .decode(h.trim_start_matches("Basic "))
            .unwrap();
        assert_eq!(raw, b"x-access-token:abc");
    }

    #[test]
    fn credential_file_round_trips_and_clears() {
        let dir = std::env::temp_dir().join(format!("trace-ghtoken-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("github-token.json");
        assert!(load_at(&file).is_none(), "missing file is signed out");
        let cred = Credential {
            token: Token::new("gho_round").unwrap(),
            source: Source::Device,
            login: "octo".into(),
        };
        save_at(&file, &cred).unwrap();
        let back = load_at(&file).unwrap();
        assert_eq!(back.token, cred.token);
        assert_eq!((back.source, back.login.as_str()), (Source::Device, "octo"));
        // (`persist::write_atomic` makes it user-only; its own tests check that.)
        clear_at(&file).unwrap();
        assert!(!file.exists());
        clear_at(&file).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
