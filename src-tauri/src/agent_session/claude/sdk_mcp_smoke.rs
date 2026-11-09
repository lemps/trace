//! trace's tools as an SDK MCP server, against a real `claude` on this machine
//! (ignored: it costs a turn). `cargo test sdk_mcp_smoke -- --ignored --nocapture`.
//! Declares the server with `initialize`, then answers Claude's `mcp_message`
//! requests with `agent_tools::rpc` over one made-up tool, and checks the
//! tool's answer reaches the conversation.

use std::io::{BufRead, BufReader, Write};
use std::process::Stdio;

use serde_json::{json, Value};

use super::translate::{mcp_reply, TOOLS_SERVER};
use crate::agent_tools::rpc::{handle, ToolReply};

#[test]
#[ignore = "runs a real claude turn"]
fn sdk_mcp_smoke_claude_calls_a_trace_tool() {
    let mut child = crate::claude::discovery::command("claude")
        .args([
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            "haiku",
            // This machine's own default mode (plan, say) would block the call.
            "--permission-mode",
            "default",
            "--settings",
            r#"{"permissions":{"allow":["mcp__trace"]}}"#,
        ])
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("claude");
    let mut stdin = child.stdin.take().expect("stdin");
    let stdout = child.stdout.take().expect("stdout");
    let mut send = |v: Value| {
        writeln!(stdin, "{v}").expect("write");
        stdin.flush().expect("flush");
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
    let (mut called, mut answer) = (false, String::new());
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let Ok(m) = serde_json::from_str::<Value>(&line) else {
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
            Some("control_response") => println!("control_response: {}", m["response"]["subtype"]),
            Some("result") => {
                answer = m["result"].as_str().unwrap_or("").to_string();
                break;
            }
            _ => {}
        }
    }
    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    println!("called: {called}, answer: {answer}");
    assert!(called, "Claude called the tool over the control channel");
    assert!(answer.to_lowercase().contains("periwinkle"), "{answer}");
}
