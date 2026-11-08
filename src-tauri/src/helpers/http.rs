//! The one HTTP client trace's tracker providers share (Jira, Pylon). Building a
//! client per request meant a fresh TCP and TLS handshake every call; one client
//! keeps its connections open, so a board load's requests reuse them.

use std::sync::OnceLock;

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// The shared client, built on first use.
pub fn client() -> Result<&'static reqwest::Client, String> {
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = reqwest::Client::builder()
        .user_agent("trace/0.1")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    Ok(CLIENT.get_or_init(|| built))
}
