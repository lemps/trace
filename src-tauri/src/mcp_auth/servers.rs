//! Which MCP servers there are to connect: the HTTP ones in the user's Claude
//! Code config (user scope, and each project's) and in a repo's `.mcp.json`.
//! Only names and URLs are read; a server's headers or env (a key someone
//! pasted) are never touched. stdio servers run on this machine, so they can't
//! go to a sandbox and aren't listed.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

/// An HTTP MCP server, as configured somewhere.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
    /// Its name in the config, which is also its tools' prefix (`mcp__<name>__`).
    pub name: String,
    pub url: String,
}

/// The HTTP servers in one `mcpServers` object.
fn http_servers(servers: &Value) -> Vec<McpServer> {
    servers
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(name, cfg)| {
            let kind = cfg["type"].as_str().unwrap_or("");
            let url = cfg["url"].as_str()?;
            let http = matches!(kind, "http" | "sse" | "streamable-http" | "");
            (http && url.starts_with("https://")).then(|| McpServer {
                name: name.clone(),
                url: url.to_string(),
            })
        })
        .collect()
}

/// Every server in Claude's config (`~/.claude.json`) and in the given repos'
/// `.mcp.json`, one per URL (the first name wins), by name.
pub fn parse(claude_json: &Value, repo_mcp_jsons: &[Value]) -> Vec<McpServer> {
    let mut found: Vec<McpServer> = http_servers(&claude_json["mcpServers"]);
    for project in claude_json["projects"].as_object().into_iter().flatten() {
        found.extend(http_servers(&project.1["mcpServers"]));
    }
    for repo in repo_mcp_jsons {
        found.extend(http_servers(&repo["mcpServers"]));
    }
    let mut by_url: BTreeMap<String, McpServer> = BTreeMap::new();
    for server in found {
        by_url.entry(server.url.clone()).or_insert(server);
    }
    let mut out: Vec<McpServer> = by_url.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name).then(a.url.cmp(&b.url)));
    out
}

fn read_json(path: &Path) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or(Value::Null)
}

/// What there is to connect on this machine.
pub fn discover() -> Vec<McpServer> {
    let claude = dirs::home_dir()
        .map(|h| read_json(&h.join(".claude.json")))
        .unwrap_or(Value::Null);
    let repos: Vec<Value> = crate::commands::repos::all_repos()
        .iter()
        .map(|r| read_json(&Path::new(r).join(".mcp.json")))
        .collect();
    parse(&claude, &repos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn http_servers_from_every_scope_once_each() {
        let claude = json!({
            "mcpServers": {
                "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp" },
                "figma": { "command": "npx", "env": { "FIGMA_ACCESS_TOKEN": "secret" } },
                "local": { "type": "http", "url": "http://localhost:3000/mcp" },
            },
            "projects": { "/x": { "mcpServers": {
                "pylon": { "type": "http", "url": "https://mcp.eu.usepylon.com" },
                "sentry-again": { "type": "http", "url": "https://mcp.sentry.dev/mcp" },
            } } },
        });
        let repo = json!({ "mcpServers": {
            "hq-tools": { "type": "http", "url": "https://terminal.obsidianos.com/api/v1/hq/mcp",
                          "headers": { "Authorization": "Bearer pasted" } },
        } });
        let got = parse(&claude, &[repo]);
        let names: Vec<&str> = got.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["hq-tools", "pylon", "sentry"]);
        let shown = format!("{got:?}");
        assert!(!shown.contains("pasted") && !shown.contains("secret"));
    }

    #[test]
    fn nothing_configured_is_nothing() {
        assert!(parse(&Value::Null, &[]).is_empty());
    }
}
