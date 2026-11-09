//! Jira credential handling: validate a connection and persist it so the app
//! reconnects on launch.
//!
//! Storage is a `0600` file in the app's config dir rather than the OS keychain.
//! On macOS the keychain ACL is bound to the exact binary, so every unsigned
//! `tauri dev` rebuild re-prompts ("Always Allow" only whitelists that one
//! build) — unusable in development. A user-only file (the same approach as
//! `gh`, `npm`, `aws`) reconnects silently. The token is never logged.
//! When release builds are code-signed we can move back to the keychain.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

use super::client;
use super::parse::parse_user;
use super::JiraConnection;
use crate::issues::models::IssueUser;

#[derive(Serialize, Deserialize)]
struct StoredSession {
    site: String,
    email: String,
    token: String,
}

/// Validate a connection by calling `/myself`. Returns the authenticated user.
pub async fn validate(conn: &JiraConnection) -> Result<IssueUser, String> {
    let v = client::get(conn, "/rest/api/3/myself").await?;
    Ok(parse_user(&v))
}

/// Persist the session (site + email + token) for silent reconnect on launch.
pub fn save(conn: &JiraConnection) -> Result<(), String> {
    persist::write_json(
        &session_path(),
        Style::Compact,
        &StoredSession {
            site: conn.site.clone(),
            email: conn.email.clone(),
            token: conn.token.clone(),
        },
    )
}

/// Load the previously-saved connection, if any. A file that can't be read just
/// means the login form: only credentials the user enters there replace it.
pub fn load() -> Option<JiraConnection> {
    let s = persist::read_or_log::<Option<StoredSession>>(&session_path())?;
    Some(JiraConnection {
        site: s.site,
        email: s.email,
        token: s.token,
    })
}

/// Forget the saved connection.
pub fn clear() -> Result<(), String> {
    let _ = std::fs::remove_file(session_path());
    Ok(())
}

fn session_path() -> PathBuf {
    crate::helpers::trace_dir().join("jira-session.json")
}
