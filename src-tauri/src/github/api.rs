//! A thin GitHub REST client over trace's own token (`token`), on the same
//! `reqwest` stack the Jira and Pylon clients use. Errors never carry the token.

use reqwest::header::HeaderMap;
use serde_json::Value;

use super::token::{redact, Token};

const API: &str = "https://api.github.com";

/// Most pages a list follows: 10 × 100 = gh's old 1000-repo cap.
pub const MAX_PAGES: usize = 10;

pub fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("trace")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// A successful response: its JSON and the headers callers read (scopes,
/// expiry, `Link`).
pub struct Response {
    pub body: Value,
    pub headers: HeaderMap,
}

impl Response {
    pub fn header(&self, name: &str) -> Option<String> {
        self.headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string)
    }
}

/// GET `path_or_url` (a path under the API root, or a full `api.github.com`
/// URL from a `Link` header) as `token`.
pub async fn get(token: &Token, path_or_url: &str) -> Result<Response, String> {
    let url = if path_or_url.starts_with("https://") {
        if !path_or_url.starts_with(&format!("{API}/")) {
            // Only ever send the token to GitHub's API.
            return Err("GitHub returned a link to another site.".into());
        }
        path_or_url.to_string()
    } else {
        format!("{API}{path_or_url}")
    };
    let resp = http()?
        .get(&url)
        .bearer_auth(token.expose())
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| redact(&format!("GitHub request failed: {e}"), Some(token)))?;
    let status = resp.status();
    let headers = resp.headers().clone();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Reading GitHub's reply failed: {e}"))?;
    if !status.is_success() {
        return Err(redact(&error_text(status.as_u16(), &text), Some(token)));
    }
    let body = serde_json::from_str(&text).map_err(|e| format!("Unexpected GitHub reply: {e}"))?;
    Ok(Response { body, headers })
}

/// Every item of a paginated list, following `Link: rel="next"` up to
/// [`MAX_PAGES`].
pub async fn get_all(token: &Token, first: &str) -> Result<Vec<Value>, String> {
    let mut items = Vec::new();
    let mut next = Some(first.to_string());
    for _ in 0..MAX_PAGES {
        let Some(url) = next.take() else { break };
        let page = get(token, &url).await?;
        next = page.header("link").and_then(|l| next_link(&l));
        match page.body {
            Value::Array(list) => items.extend(list),
            _ => return Err("Unexpected GitHub reply: not a list".into()),
        }
    }
    Ok(items)
}

/// The `rel="next"` URL of a `Link` header.
pub fn next_link(header: &str) -> Option<String> {
    header.split(',').find_map(|part| {
        let (url, params) = part.split_once(';')?;
        let is_next = params
            .split(';')
            .any(|p| p.trim().replace(' ', "") == r#"rel="next""#);
        let url = url.trim().strip_prefix('<')?.strip_suffix('>')?;
        is_next.then(|| url.to_string())
    })
}

/// A short reason for a failed call: GitHub's `message`, or what the status means.
pub fn error_text(status: u16, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("message").and_then(Value::as_str).map(str::to_string));
    match (status, message) {
        (401, _) => {
            "GitHub refused the token (it may be expired or revoked). Sign in again.".into()
        }
        (_, Some(m)) => format!("GitHub said: {m} (HTTP {status})"),
        _ => format!("GitHub request failed (HTTP {status})."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_next_page() {
        let h = r#"<https://api.github.com/user/repos?page=2&per_page=100>; rel="next", <https://api.github.com/user/repos?page=5&per_page=100>; rel="last""#;
        assert_eq!(
            next_link(h).as_deref(),
            Some("https://api.github.com/user/repos?page=2&per_page=100")
        );
        let last = r#"<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=1>; rel="first""#;
        assert_eq!(next_link(last), None);
        assert_eq!(next_link(""), None);
        assert_eq!(next_link("garbage"), None);
    }

    #[test]
    fn errors_say_why_without_the_body() {
        assert!(error_text(401, "{}").contains("Sign in again"));
        assert_eq!(
            error_text(404, r#"{"message":"Not Found"}"#),
            "GitHub said: Not Found (HTTP 404)"
        );
        assert_eq!(
            error_text(502, "<html>"),
            "GitHub request failed (HTTP 502)."
        );
    }

    #[tokio::test]
    async fn never_sends_the_token_off_github() {
        let t = Token::new("ghp_x").unwrap();
        let err = get(&t, "https://evil.example/api.github.com/")
            .await
            .err()
            .unwrap();
        assert!(err.contains("another site"));
    }
}
