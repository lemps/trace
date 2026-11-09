//! The team's MCP servers in a real sandbox (ignored by default; needs a
//! Claude login saved in this trace):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_mcp -- --ignored --nocapture`.
//! Logging in to a server takes a browser, so this uses what the sandbox side
//! is made of: a token injected for a server's path and below, and Claude
//! given the server by URL alone. Context7 (public, no login) stands in.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::execution::credential;
use crate::execution::sandbox::egress::{self, Injection};
use crate::execution::sandbox::{helpers, SandboxProvider, SandboxSpec};

fn sh(p: &Vercel, sid: &str, script: &str, env: &HashMap<String, String>) -> String {
    let argv = vec!["bash".to_string(), "-c".to_string(), script.to_string()];
    let out = p.exec(sid, &argv, env).expect("exec");
    format!("{}{}", out.stdout, out.stderr).trim().to_string()
}

fn bearer(domain: &str, prefix: &str, token: &str) -> Injection {
    Injection {
        domain: domain.into(),
        headers: vec![("Authorization".into(), format!("Bearer {token}"))],
        path_prefix: Some(prefix.into()),
        ..Injection::default()
    }
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_mcp_server_reached_by_url_with_its_token_added() {
    let (Some(token), Some(claude)) = (token(), credential::load()) else {
        eprintln!("no Vercel token or Claude login; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let name = format!(
        "trace-mcp-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: name.clone(),
    };
    let info = provider
        .create(&SandboxSpec {
            name: name.clone(),
            labels: vec![("trace".into(), "live-test".into())],
            timeout: Duration::from_secs(10 * 60),
            ports: Vec::new(),
        })
        .expect("create");
    let sid = info.session_id.expect("session");
    let logins = egress::apply(
        &*provider,
        &name,
        &sid,
        None,
        Some(&claude),
        vec![bearer("httpbin.org", "/anything/mcp", "server-token")],
        &|l| println!("  say: {l}"),
    );
    assert!(logins.injected);

    // The token goes to the server's path and below, not the rest of its host.
    let under = sh(
        &provider,
        &sid,
        "curl -s https://httpbin.org/anything/mcp/x",
        &HashMap::new(),
    );
    let beside = sh(
        &provider,
        &sid,
        "curl -s https://httpbin.org/anything/other",
        &HashMap::new(),
    );
    assert!(under.contains("Bearer server-token"), "{under}");
    assert!(!beside.contains("server-token"), "{beside}");

    // Claude reaches a server it was given by URL alone, through the network.
    // (With a made-up token injected for it, Context7 answered "Invalid API
    // key": the token reaches the server's requests. Here it gets none.)
    let config =
        r#"{"mcpServers":{"context7":{"type":"http","url":"https://mcp.context7.com/mcp"}}}"#;
    let args = helpers::with_hook_settings(helpers::with_mcp_config(
        vec![
            "--permission-mode".into(),
            "default".into(),
            "--allowedTools".into(),
            "mcp__context7".into(),
        ],
        Some(config),
    ));
    let quoted: Vec<String> = args
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', r"'\''")))
        .collect();
    let ask = format!(
        "cd /tmp && timeout 150 claude -p --model haiku {} 'Use the context7 resolve-library-id tool to look up react. Reply with only the first library ID it returns.' 2>&1 | tail -c 400",
        quoted.join(" ")
    );
    let said = sh(&provider, &sid, &ask, &logins.env);
    println!("claude with context7: {said}");
    assert!(said.contains('/'), "Claude used the server's tool: {said}");
}
