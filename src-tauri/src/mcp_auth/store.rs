//! trace's own MCP logins, in a user-only file like every credential: per
//! server, the tokens it holds; per authorization server, the client trace is
//! registered as. Never Claude Code's tokens (refreshing those could rotate
//! them out from under the local CLI), never sent to the renderer, never logged.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::oauth::{self, Client, Tokens};
use crate::helpers::persist::{self, Style};

/// A server trace is logged in to.
#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub name: String,
    pub url: String,
    pub issuer: String,
    pub resource: String,
    pub token_endpoint: String,
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    /// Epoch ms; None when the server didn't say.
    #[serde(default)]
    pub expires_at: Option<u64>,
}

impl std::fmt::Debug for Grant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Grant({} {}, until {:?})",
            self.name, self.url, self.expires_at
        )
    }
}

#[derive(Default, Serialize, Deserialize)]
struct File {
    /// By server URL.
    #[serde(default)]
    grants: BTreeMap<String, Grant>,
    /// By issuer: what trace is registered as there.
    #[serde(default)]
    clients: BTreeMap<String, Client>,
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("mcp-logins.json")
}

fn read() -> File {
    persist::read_or_log::<File>(&path())
}

fn update<R>(f: impl FnOnce(&mut File) -> R) -> Result<R, String> {
    persist::update(&path(), Style::Pretty, f)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

/// Every server trace is logged in to.
pub fn grants() -> Vec<Grant> {
    read().grants.into_values().collect()
}

pub fn client_for(issuer: &str) -> Option<Client> {
    read().clients.get(issuer).cloned()
}

pub fn save_client(issuer: &str, client: &Client) -> Result<(), String> {
    update(|f| {
        f.clients.insert(issuer.to_string(), client.clone());
    })
}

/// A grant from tokens just received.
pub fn grant_from(name: &str, url: &str, d: &oauth::Discovered, t: Tokens) -> Grant {
    Grant {
        name: name.to_string(),
        url: url.to_string(),
        issuer: d.issuer.clone(),
        resource: d.resource.clone(),
        token_endpoint: d.token_endpoint.clone(),
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: t.expires_in.map(|s| now_ms() + s * 1000),
    }
}

pub fn save(grant: &Grant) -> Result<(), String> {
    update(|f| {
        f.grants.insert(grant.url.clone(), grant.clone());
    })
}

pub fn forget(url: &str) -> Result<(), String> {
    update(|f| {
        f.grants.remove(url);
    })
}

/// Refreshed when it has less than this left.
const REFRESH_WITHIN_MS: u64 = 10 * 60 * 1000;

/// Whether `grant` should be refreshed at `now`.
pub fn due(grant: &Grant, now: u64) -> bool {
    grant
        .expires_at
        .is_some_and(|at| at.saturating_sub(REFRESH_WITHIN_MS) <= now)
}

/// `grant` with a token good for a while yet: refreshed (and saved) when it's
/// close to expiring and can be. Err when it has expired and can't be.
pub fn fresh(grant: Grant) -> Result<Grant, String> {
    if !due(&grant, now_ms()) {
        return Ok(grant);
    }
    let (Some(refresh), Some(client)) = (grant.refresh_token.clone(), client_for(&grant.issuer))
    else {
        return expired_or(grant);
    };
    match oauth::refresh(&grant.token_endpoint, &client, &grant.resource, &refresh) {
        Ok(t) => {
            let renewed = Grant {
                access_token: t.access_token,
                // A server may rotate it; else the old one stays good.
                refresh_token: t.refresh_token.or(Some(refresh)),
                expires_at: t.expires_in.map(|s| now_ms() + s * 1000),
                ..grant
            };
            save(&renewed)?;
            Ok(renewed)
        }
        Err(_) => expired_or(grant),
    }
}

/// Not refreshable: still usable until it expires.
fn expired_or(grant: Grant) -> Result<Grant, String> {
    match grant.expires_at {
        Some(at) if at <= now_ms() => Err(format!(
            "Your {} login has expired: connect it again.",
            grant.name
        )),
        _ => Ok(grant),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grant(expires_at: Option<u64>) -> Grant {
        Grant {
            name: "sentry".into(),
            url: "https://mcp.sentry.dev/mcp".into(),
            issuer: "https://mcp.sentry.dev".into(),
            resource: "https://mcp.sentry.dev/mcp".into(),
            token_endpoint: "https://mcp.sentry.dev/oauth/token".into(),
            access_token: "secret-access".into(),
            refresh_token: Some("secret-refresh".into()),
            expires_at,
        }
    }

    #[test]
    fn refreshed_ten_minutes_before_it_expires() {
        let now = 1_000_000_000;
        assert!(!due(&grant(Some(now + 11 * 60 * 1000)), now));
        assert!(due(&grant(Some(now + 9 * 60 * 1000)), now));
        assert!(!due(&grant(None), now), "no expiry said: used as is");
    }

    #[test]
    fn a_grant_never_shows_its_tokens() {
        let shown = format!("{:?}", grant(None));
        assert!(!shown.contains("secret"));
    }
}
