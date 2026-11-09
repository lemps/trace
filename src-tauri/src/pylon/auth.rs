//! Pylon credential handling: validate a token and persist it so the app
//! reconnects on launch. Same `0600` config-file pattern as `jira/auth.rs` —
//! the token is never logged and never crosses to the renderer.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};
use crate::issues::models::IssueUser;

use super::client;
use super::{PylonConnection, EU_BASE_URL};

#[derive(Serialize, Deserialize)]
struct StoredSession {
    token: String,
    /// Resolved API base URL (region-sharded). Defaults to US for sessions
    /// saved before regions were tracked.
    #[serde(default)]
    base_url: Option<String>,
}

/// Validate a token by calling `GET /me`, resolving the region as a side
/// effect: EU tokens 401 on the US endpoint with a hint naming the EU one, so
/// on that error we retry against it. Returns the user and the connection with
/// its region resolved (the caller persists and stores *that*).
pub async fn validate(conn: &PylonConnection) -> Result<(IssueUser, PylonConnection), String> {
    match client::get(conn, "/me").await {
        Ok(v) => Ok((parse_me(&v), conn.clone())),
        Err(e) if e.contains("api.eu.usepylon.com") => {
            let eu = PylonConnection {
                token: conn.token.clone(),
                base_url: EU_BASE_URL.to_string(),
            };
            let v = client::get(&eu, "/me").await?;
            Ok((parse_me(&v), eu))
        }
        Err(e) => Err(e),
    }
}

/// `/me` returns {"data": {"id", "name" (org), "user": {"id", "email"}}} —
/// org-centric, with the calling user nested. User fields are best-effort.
fn parse_me(v: &serde_json::Value) -> IssueUser {
    let data = client::data(v);
    let user = data.get("user").unwrap_or(data);
    let str_field = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| {
                user.get(k)
                    .and_then(|x| x.as_str())
                    .filter(|s| !s.is_empty())
            })
            .map(str::to_string)
    };
    let email = str_field(&["email"]);
    let display_name = str_field(&["name", "display_name"])
        .or_else(|| {
            email
                .as_ref()
                .and_then(|e| e.split('@').next().map(str::to_string))
        })
        .or_else(|| {
            data.get("name")
                .and_then(|n| n.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Pylon".to_string());
    IssueUser {
        account_id: str_field(&["id", "user_id"]).unwrap_or_default(),
        display_name,
        email,
        avatar_url: str_field(&["avatar_url"]),
    }
}

/// Persist the session (token + resolved region) for silent reconnect on launch.
pub fn save(conn: &PylonConnection) -> Result<(), String> {
    persist::write_json(
        &session_path(),
        Style::Compact,
        &StoredSession {
            token: conn.token.clone(),
            base_url: Some(conn.base_url.clone()),
        },
    )
}

/// Load the previously-saved connection, if any. A file that can't be read just
/// means the login form: only credentials the user enters there replace it.
pub fn load() -> Option<PylonConnection> {
    let s = persist::read_or_log::<Option<StoredSession>>(&session_path())?;
    let mut conn = PylonConnection::new(s.token);
    if let Some(base) = s.base_url {
        conn.base_url = base;
    }
    Some(conn)
}

/// Forget the saved connection.
pub fn clear() -> Result<(), String> {
    let _ = std::fs::remove_file(session_path());
    Ok(())
}

fn session_path() -> PathBuf {
    crate::helpers::trace_dir().join("pylon-session.json")
}
