//! trace's tools for a chat in a real sandbox (ignored by default; needs a
//! Claude login saved in this trace):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_tools -- --ignored --nocapture`.
//! The sandbox's Claude runs as the chat does (a background command speaking
//! stream-json), is told about the SDK server, and calls a made-up tool.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::{json, Value};

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::agent_session::claude::translate::{mcp_reply, TOOLS_SERVER};
use crate::agent_tools::rpc::{handle, ToolReply};
use crate::execution::credential;
use crate::execution::sandbox::host::{ready, SandboxTarget, Secrets};
use crate::execution::sandbox::{Output, SandboxProvider};
use crate::repo_catalog::model::RemoteRepo;

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_tools_reach_a_sandbox_chat() {
    let (Some(token), Some(claude)) = (token(), credential::load()) else {
        eprintln!("no Vercel token or Claude login; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!("tools-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: tools".into(),
        setup: Default::default(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let secrets = Secrets {
        claude: Some(claude),
        ..Secrets::default()
    };
    let r = ready(&*provider, &target, &secrets, &HashMap::new(), &|l| {
        println!("  say: {l}")
    })
    .expect("ready");
    let version = provider
        .exec(
            &r.session_id,
            &["claude".into(), "--version".into()],
            &HashMap::new(),
        )
        .expect("version");
    println!("sandbox claude: {}", version.stdout.trim());
    let argv: Vec<String> = [
        "claude",
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "haiku",
        "--permission-mode",
        "default",
        "--settings",
        r#"{"permissions":{"allow":["mcp__trace"]}}"#,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    let cmd = provider
        .start_command(&r.session_id, &argv, &r.agent_env(HashMap::new()), &r.dir)
        .expect("start");
    let send = |v: Value| {
        provider
            .write_stdin(&r.session_id, &cmd, format!("{v}\n").as_bytes())
            .expect("stdin")
    };
    send(json!({ "type": "control_request", "request_id": "init",
        "request": { "subtype": "initialize", "sdkMcpServers": [TOOLS_SERVER] } }));
    send(
        json!({ "type": "user", "message": { "role": "user", "content":
        "Call the secret_word tool from the trace MCP server and reply with exactly the word it returns." } }),
    );
    let tools = vec![
        json!({ "name": "secret_word", "description": "Returns the secret word.",
        "inputSchema": { "type": "object", "properties": {} } }),
    ];
    // Answer Claude's requests as its output comes; it waits on each reply.
    let (mut called, mut answer, mut pending) = (false, String::new(), Vec::<u8>::new());
    'read: for chunk in provider
        .command_output(&r.session_id, &cmd)
        .expect("output")
    {
        let Output::Stdout(bytes) = chunk else {
            continue;
        };
        pending.extend(bytes);
        while let Some(end) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            let Ok(m) = serde_json::from_slice::<Value>(&line) else {
                continue;
            };
            match m["type"].as_str() {
                Some("control_request") if m["request"]["subtype"] == "mcp_message" => {
                    let msg = &m["request"]["message"];
                    println!("mcp_message: {}", msg["method"]);
                    let reply = handle(msg, &tools, |name, _| {
                        called = name == "secret_word";
                        ToolReply {
                            text: "periwinkle".into(),
                            is_error: false,
                        }
                    });
                    send(mcp_reply(m["request_id"].as_str().unwrap_or(""), reply));
                }
                Some("control_response") => {
                    println!("control_response: {}", m["response"]["subtype"]);
                }
                Some("result") => {
                    answer = m["result"].as_str().unwrap_or("").to_string();
                    break 'read;
                }
                _ => {}
            }
        }
    }
    let _ = provider.kill_command(&r.session_id, &cmd);
    println!("called: {called}, answer: {answer}");
    assert!(
        called,
        "the sandbox's Claude called the tool over the control channel"
    );
    assert!(answer.to_lowercase().contains("periwinkle"), "{answer}");
}
