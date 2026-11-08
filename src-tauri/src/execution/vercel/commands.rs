//! Background commands in a Vercel sandbox: how a chat agent runs there. Start
//! one with its stdin attached, write to it, read its log stream (stdout and
//! stderr, from the start), kill it, wait for it. Tried on a live sandbox
//! (`docs/REMOTE_EXECUTION_PLAN.md`): a line written comes back in ~0.2 s, and
//! reopening the stream replays it from the start.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};

use base64::Engine;
use serde_json::{json, Value};

use super::client::Api;
use crate::execution::sandbox::{Output, OutputStream};

fn cmd_path(session_id: &str, command_id: &str, tail: &str) -> String {
    format!("/v2/sandboxes/sessions/{session_id}/cmd/{command_id}{tail}")
}

pub fn start(
    api: &Api,
    session_id: &str,
    argv: &[String],
    env: &HashMap<String, String>,
    cwd: &str,
) -> Result<String, String> {
    let (command, args) = argv.split_first().ok_or("No command to run.")?;
    let body = json!({
        "command": command,
        "args": args,
        "env": env,
        "cwd": cwd,
        "attachStdin": true,
    });
    let v = api.post(
        &format!("/v2/sandboxes/sessions/{session_id}/cmd"),
        &[],
        &body,
    )?;
    v["command"]["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "Vercel didn't say which command it started.".to_string())
}

pub fn write_stdin(
    api: &Api,
    session_id: &str,
    command_id: &str,
    data: &[u8],
) -> Result<(), String> {
    let data = base64::engine::general_purpose::STANDARD.encode(data);
    api.post(
        &cmd_path(session_id, command_id, "/stdin"),
        &[],
        &json!({ "data": data }),
    )?;
    Ok(())
}

pub fn close_stdin(api: &Api, session_id: &str, command_id: &str) -> Result<(), String> {
    let body = json!({ "data": "", "close": true });
    api.post(&cmd_path(session_id, command_id, "/stdin"), &[], &body)?;
    Ok(())
}

pub fn kill(api: &Api, session_id: &str, command_id: &str) -> Result<(), String> {
    let body = json!({ "signal": "SIGTERM" });
    api.post(&cmd_path(session_id, command_id, "/kill"), &[], &body)?;
    Ok(())
}

pub fn done(api: &Api, session_id: &str, command_id: &str) -> Result<bool, String> {
    let v = api.get(&cmd_path(session_id, command_id, ""), &[])?;
    Ok(!v["command"]["exitCode"].is_null())
}

pub fn wait(api: &Api, session_id: &str, command_id: &str) -> Result<Option<i32>, String> {
    let res = api.get_stream(&cmd_path(session_id, command_id, ""), &[("wait", "true")])?;
    let v: Value = res.json().unwrap_or_default();
    Ok(v["command"]["exitCode"]
        .as_i64()
        .and_then(|c| i32::try_from(c).ok()))
}

/// One ND-JSON log line as output; anything else is skipped.
fn chunk(line: &str) -> Option<Output> {
    let v: Value = serde_json::from_str(line).ok()?;
    let data = v["data"].as_str()?.as_bytes().to_vec();
    match v["stream"].as_str()? {
        "stdout" => Some(Output::Stdout(data)),
        "stderr" => Some(Output::Stderr(data)),
        _ => None,
    }
}

pub fn output(api: &Api, session_id: &str, command_id: &str) -> Result<OutputStream, String> {
    let res = api.get_stream(&cmd_path(session_id, command_id, "/logs"), &[])?;
    let lines = BufReader::new(res).lines().map_while(Result::ok);
    Ok(Box::new(lines.filter_map(|l| chunk(&l))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_lines_split_into_stdout_and_stderr() {
        assert_eq!(
            chunk(r#"{"stream":"stdout","data":"{\"type\":\"init\"}\n"}"#),
            Some(Output::Stdout(b"{\"type\":\"init\"}\n".to_vec()))
        );
        assert_eq!(
            chunk(r#"{"stream":"stderr","data":"warn"}"#),
            Some(Output::Stderr(b"warn".to_vec()))
        );
        assert_eq!(chunk(r#"{"command":{"id":"cmd_1"}}"#), None);
        assert_eq!(chunk("not json"), None);
    }
}
