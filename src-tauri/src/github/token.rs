//! A GitHub token, the credential every GitHub call (and a cloud sandbox's
//! clone and push) uses, so nothing depends on a local `gh` login. Stored per
//! account by `github::accounts`.
//!
//! Never logged, emitted or returned to the renderer: [`Token`]
//! has no `Serialize` and a redacted `Debug`, and every error that might echo
//! it goes through [`redact`].

use std::fmt;

use base64::Engine;

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
        assert!(!format!("{t:?}").contains("SECRET"));
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
}
