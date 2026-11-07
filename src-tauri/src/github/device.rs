//! Signing in with GitHub's OAuth device flow: trace shows a code, the user
//! enters it at github.com/login/device, and trace polls until GitHub hands
//! over a token. Needs an OAuth app with device flow enabled, but no client
//! secret, so the client id can ship in the binary. Until one is registered
//! [`CLIENT_ID`] is empty and the option is hidden.
//!
//! The device code stays here (it's what redeems the token); the renderer only
//! gets the short user code to type in.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use super::api::http;
use super::token::Token;

/// The OAuth app's client id. Empty: no app is registered yet.
pub const GITHUB_OAUTH_CLIENT_ID: &str = "";

/// What the token may do: clone private repos, and list the user's orgs.
const SCOPES: &str = "repo read:org";

const CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";

pub fn enabled() -> bool {
    !GITHUB_OAUTH_CLIENT_ID.is_empty()
}

/// What the user needs to finish signing in.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    pub user_code: String,
    pub verification_uri: String,
    /// Seconds until the code expires.
    pub expires_in: u64,
}

struct Pending {
    device_code: String,
    interval: Duration,
    deadline: Instant,
}

/// The sign-in in progress. `generation` is bumped by each start and cancel, so
/// a superseded start or wait stops instead of acting on a newer flow.
struct Flow {
    generation: u64,
    pending: Option<Pending>,
}

static FLOW: Mutex<Flow> = Mutex::new(Flow {
    generation: 0,
    pending: None,
});

fn flow() -> MutexGuard<'static, Flow> {
    FLOW.lock().unwrap_or_else(|p| p.into_inner())
}

/// Forget any flow in progress; the new generation.
fn reset() -> u64 {
    let mut f = flow();
    f.generation += 1;
    f.pending = None;
    f.generation
}

async fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    let resp = http()?
        .post(url)
        .header("Accept", "application/json")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("GitHub request failed: {e}"))?;
    resp.json::<Value>()
        .await
        .map_err(|_| "Unexpected reply from GitHub.".to_string())
}

/// Ask GitHub for a code to show the user.
pub async fn start() -> Result<DeviceStart, String> {
    if !enabled() {
        return Err("Signing in with the browser isn't set up in this build.".into());
    }
    let generation = reset();
    let v = post_form(
        CODE_URL,
        &[("client_id", GITHUB_OAUTH_CLIENT_ID), ("scope", SCOPES)],
    )
    .await?;
    let text = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let num = |k: &str| v.get(k).and_then(Value::as_u64);
    let (Some(device_code), Some(user_code), Some(uri)) = (
        text("device_code"),
        text("user_code"),
        text("verification_uri"),
    ) else {
        return Err(text("error_description").unwrap_or_else(|| "GitHub refused to start.".into()));
    };
    let expires_in = num("expires_in").unwrap_or(900);
    let mut f = flow();
    if f.generation != generation {
        return Err("Sign-in cancelled.".into());
    }
    f.pending = Some(Pending {
        device_code,
        interval: Duration::from_secs(num("interval").unwrap_or(5).max(1)),
        deadline: Instant::now() + Duration::from_secs(expires_in),
    });
    Ok(DeviceStart {
        user_code,
        verification_uri: uri,
        expires_in,
    })
}

/// Stop waiting for the pending sign-in.
pub fn cancel() {
    reset();
}

/// One poll's answer.
#[derive(Debug, PartialEq)]
pub enum Poll {
    Done(Token),
    Pending,
    /// Poll less often: the new interval, if GitHub gave one.
    SlowDown(Option<u64>),
    Failed(String),
}

/// Read a reply from the token endpoint.
pub fn parse_poll(v: &Value) -> Poll {
    if let Some(t) = v.get("access_token").and_then(Value::as_str) {
        return Token::new(t).map_or(
            Poll::Failed("GitHub sent an empty token.".into()),
            Poll::Done,
        );
    }
    match v.get("error").and_then(Value::as_str) {
        Some("authorization_pending") => Poll::Pending,
        Some("slow_down") => Poll::SlowDown(v.get("interval").and_then(Value::as_u64)),
        Some("expired_token") => Poll::Failed("The code expired. Start again.".into()),
        Some("access_denied") => Poll::Failed("Sign-in was cancelled on GitHub.".into()),
        _ => Poll::Failed(
            v.get("error_description")
                .and_then(Value::as_str)
                .unwrap_or("GitHub didn't finish the sign-in.")
                .to_string(),
        ),
    }
}

/// Poll until the user approves, the code expires, or [`cancel`] / a new
/// [`start`] supersedes this wait.
pub async fn wait() -> Result<Token, String> {
    let (generation, device_code, mut interval, deadline) = {
        let f = flow();
        let p = f.pending.as_ref().ok_or("No sign-in is in progress.")?;
        (f.generation, p.device_code.clone(), p.interval, p.deadline)
    };
    loop {
        tokio::time::sleep(interval).await;
        if flow().generation != generation {
            return Err("Sign-in cancelled.".into());
        }
        if Instant::now() >= deadline {
            return Err("The code expired. Start again.".into());
        }
        let v = post_form(
            TOKEN_URL,
            &[
                ("client_id", GITHUB_OAUTH_CLIENT_ID),
                ("device_code", &device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ],
        )
        .await?;
        match parse_poll(&v) {
            Poll::Done(token) => {
                cancel();
                return Ok(token);
            }
            Poll::Pending => {}
            Poll::SlowDown(next) => {
                interval = next.map_or(interval + Duration::from_secs(5), Duration::from_secs)
            }
            Poll::Failed(e) => {
                cancel();
                return Err(e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn poll_replies() {
        assert_eq!(
            parse_poll(&json!({"access_token":"gho_x","token_type":"bearer","scope":"repo"})),
            Poll::Done(Token::new("gho_x").unwrap())
        );
        assert_eq!(
            parse_poll(&json!({"error":"authorization_pending"})),
            Poll::Pending
        );
        assert_eq!(
            parse_poll(&json!({"error":"slow_down","interval":10})),
            Poll::SlowDown(Some(10))
        );
        assert!(matches!(
            parse_poll(&json!({"error":"expired_token"})),
            Poll::Failed(_)
        ));
        assert!(matches!(
            parse_poll(&json!({"error":"incorrect_client_credentials","error_description":"bad"})),
            Poll::Failed(m) if m == "bad"
        ));
    }

    #[test]
    fn hidden_without_a_client_id() {
        assert_eq!(enabled(), !GITHUB_OAUTH_CLIENT_ID.is_empty());
    }
}
