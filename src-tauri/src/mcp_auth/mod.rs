//! The team's MCP servers (Sentry, Metabase, Pylon, hq-tools…) for agents in a
//! cloud sandbox. They log in with OAuth, and their tokens live in each
//! person's Claude Code keychain, which a sandbox doesn't have. So trace logs
//! in to each itself, once per person (`flow`, `oauth`), keeps the tokens
//! (`store`), and a sandbox's network adds each one to that server's requests
//! (`execution::sandbox::egress`): Claude in the sandbox gets only the URLs.
//! Agents on this machine keep using Claude Code's own config.

pub mod flow;
pub mod oauth;
pub mod servers;
pub mod store;

use serde::Serialize;

use crate::execution::sandbox::egress::Injection;

/// A server as Integrations → MCP servers shows it. No token.
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub name: String,
    pub url: String,
    pub host: String,
    pub connected: bool,
    /// Epoch ms the current token expires, when the server said.
    pub expires_at: Option<u64>,
    /// It can be refreshed without the browser.
    pub refreshable: bool,
}

fn host_of(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default()
}

/// What there is to connect, and what's connected: the servers configured on
/// this machine, and any trace is logged in to that are no longer configured.
pub fn statuses() -> Vec<ServerStatus> {
    let grants = store::grants();
    let mut out: Vec<ServerStatus> = servers::discover()
        .into_iter()
        .map(|s| {
            let grant = grants.iter().find(|g| g.url == s.url);
            ServerStatus {
                host: host_of(&s.url),
                connected: grant.is_some(),
                expires_at: grant.and_then(|g| g.expires_at),
                refreshable: grant.is_some_and(|g| g.refresh_token.is_some()),
                name: s.name,
                url: s.url,
            }
        })
        .collect();
    let known: Vec<String> = out.iter().map(|s| s.url.clone()).collect();
    for g in grants.iter().filter(|g| !known.contains(&g.url)) {
        out.push(ServerStatus {
            name: g.name.clone(),
            url: g.url.clone(),
            host: host_of(&g.url),
            connected: true,
            expires_at: g.expires_at,
            refreshable: g.refresh_token.is_some(),
        });
    }
    out
}

/// What a sandbox gets of the connected servers.
#[derive(Debug, Default)]
pub struct ForSandbox {
    /// Each server's token, for its host and path.
    pub injections: Vec<Injection>,
    /// `--mcp-config` for Claude: the servers by URL, no headers. None if none.
    pub config: Option<String>,
    /// Servers left out (their login expired), by name.
    pub left_out: Vec<String>,
}

/// The server name trace's own tools use; a configured one by it would clash.
const RESERVED: &str = "trace";

/// Every connected server, with a token good for a while (refreshed if need be).
/// Blocking: a refresh asks the server.
pub fn for_sandbox() -> ForSandbox {
    let mut out = ForSandbox::default();
    let mut config = serde_json::Map::new();
    for grant in store::grants() {
        if grant.name == RESERVED {
            continue;
        }
        match store::fresh(grant.clone()) {
            Ok(g) => {
                let Some(u) = reqwest::Url::parse(&g.url).ok() else {
                    continue;
                };
                let path = u.path().trim_end_matches('/');
                out.injections.push(Injection {
                    domain: host_of(&g.url),
                    headers: vec![(
                        "Authorization".to_string(),
                        format!("Bearer {}", g.access_token),
                    )],
                    path_prefix: (!path.is_empty()).then(|| path.to_string()),
                    ..Injection::default()
                });
                config.insert(
                    g.name.clone(),
                    serde_json::json!({ "type": "http", "url": g.url }),
                );
            }
            Err(_) => out.left_out.push(grant.name),
        }
    }
    if !config.is_empty() {
        out.config = Some(serde_json::json!({ "mcpServers": config }).to_string());
    }
    out
}
