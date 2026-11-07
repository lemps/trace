//! trace's tools for a Codex agent, passed per launch as `-c` overrides (Codex
//! has no `--mcp-config`). The same endpoint and `X-Trace-Workspace` header as
//! Claude's, as a streamable-HTTP server, and nothing is written to the user's
//! `~/.codex/config.toml`.
//!
//! The token never goes on the command line: Codex reads it from the agent's
//! environment (`bearer_token_env_var`), and Codex's default shell policy
//! drops `*TOKEN*` variables from the commands it runs. Both `codex` (the TUI)
//! and `codex app-server` take these flags (checked against codex-cli 0.147.0).

use std::collections::HashMap;

use super::ToolServer;

/// The env var the agent's Codex reads trace's token from.
pub const TOKEN_ENV: &str = "TRACE_MCP_TOKEN";

/// How long Codex waits on one call: above the server's own timeout, so a
/// slow call (start_agent, a confirm the user hasn't answered) ends with
/// trace's answer rather than Codex's 60-second default.
const TOOL_TIMEOUT_SECS: u32 = 200;

/// A TOML basic string. JSON's escapes are all valid TOML ones.
fn toml_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "\"\"".to_string())
}

/// The `-c` flags and env that give a Codex agent trace's tools. Empty when the
/// server didn't bind. `instructions` (the server's own) become the thread's
/// developer instructions unless the user set theirs (`user_has_instructions`),
/// which a `-c` would replace rather than add to.
pub fn wiring(
    server: &ToolServer,
    workspace_id: &str,
    instructions: Option<&str>,
) -> (Vec<String>, HashMap<String, String>) {
    if server.port == 0 {
        return (Vec::new(), HashMap::new());
    }
    let url = format!("http://127.0.0.1:{}/mcp", server.port);
    let header = format!("{{ \"X-Trace-Workspace\" = {} }}", toml_str(workspace_id));
    let mut overrides = vec![
        format!("mcp_servers.trace.url={}", toml_str(&url)),
        format!(
            "mcp_servers.trace.bearer_token_env_var={}",
            toml_str(TOKEN_ENV)
        ),
        format!("mcp_servers.trace.http_headers={header}"),
        format!("mcp_servers.trace.tool_timeout_sec={TOOL_TIMEOUT_SECS}"),
        // trace's tools act on trace itself, like Claude's `mcp__trace` allow rule.
        "mcp_servers.trace.default_tools_approval_mode=\"approve\"".to_string(),
    ];
    if let Some(text) = instructions {
        overrides.push(format!("developer_instructions={}", toml_str(text)));
    }
    let args = overrides
        .into_iter()
        .flat_map(|o| ["-c".to_string(), o])
        .collect();
    let env = HashMap::from([(TOKEN_ENV.to_string(), server.token.clone())]);
    (args, env)
}

/// Whether the user's Codex config sets its own developer instructions, in
/// `$CODEX_HOME/config.toml` (default `~/.codex`). Only the key is looked for.
pub fn user_has_instructions() -> bool {
    let home = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".codex")));
    let Some(file) = home.map(|h| h.join("config.toml")) else {
        return false;
    };
    std::fs::read_to_string(file)
        .map(|text| sets_instructions(&text))
        .unwrap_or(false)
}

fn sets_instructions(config: &str) -> bool {
    config.lines().any(|line| {
        let key = line.trim_start().split('=').next().unwrap_or("").trim();
        key == "developer_instructions"
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server() -> ToolServer {
        ToolServer {
            port: 4321,
            token: "s3cret-token".into(),
        }
    }

    #[test]
    fn the_token_is_only_in_the_env_never_in_args() {
        let (args, env) = wiring(&server(), "sess-1", Some("Hi"));
        assert!(args.iter().all(|a| !a.contains("s3cret-token")), "{args:?}");
        assert_eq!(env.get(TOKEN_ENV).map(String::as_str), Some("s3cret-token"));
        assert_eq!(env.len(), 1);
    }

    #[test]
    fn every_override_is_a_c_flag_pair() {
        let (args, _) = wiring(&server(), "sess-1", None);
        assert_eq!(args.len() % 2, 0);
        for pair in args.chunks(2) {
            assert_eq!(pair[0], "-c");
        }
        let values: Vec<&str> = args.iter().skip(1).step_by(2).map(String::as_str).collect();
        assert!(values.contains(&"mcp_servers.trace.url=\"http://127.0.0.1:4321/mcp\""));
        assert!(values.contains(&"mcp_servers.trace.bearer_token_env_var=\"TRACE_MCP_TOKEN\""));
        assert!(values
            .contains(&"mcp_servers.trace.http_headers={ \"X-Trace-Workspace\" = \"sess-1\" }"));
        assert!(!values
            .iter()
            .any(|v| v.starts_with("developer_instructions")));
    }

    #[test]
    fn a_workspace_id_cant_break_out_of_its_toml_string() {
        let (args, _) = wiring(&server(), "a\" , evil = \"1", None);
        let header = args.iter().find(|a| a.contains("http_headers")).unwrap();
        assert!(header.contains(r#""a\" , evil = \"1""#), "{header}");
    }

    #[test]
    fn instructions_are_one_escaped_toml_string() {
        let (args, _) = wiring(&server(), "w", Some("line \"one\"\nline two"));
        let last = args.last().unwrap();
        assert_eq!(last, r#"developer_instructions="line \"one\"\nline two""#);
    }

    #[test]
    fn no_server_means_no_tools() {
        let off = ToolServer::default();
        let (args, env) = wiring(&off, "w", Some("x"));
        assert!(args.is_empty() && env.is_empty());
    }

    #[test]
    fn user_instructions_are_noticed_by_key_only() {
        assert!(sets_instructions(
            "model = \"o3\"\ndeveloper_instructions = \"be terse\"\n"
        ));
        assert!(sets_instructions("  developer_instructions=\"x\""));
        assert!(!sets_instructions(
            "# developer_instructions are nice\nmodel = \"o3\""
        ));
    }
}
