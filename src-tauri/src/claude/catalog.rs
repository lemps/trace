//! What the installed Claude Code offers — its models and its slash commands —
//! asked of the CLI itself.
//!
//! Claude Code's stream-json `initialize` control response lists every model its
//! `/model` picker shows (aliases and full ids, with display names) for the
//! account it's logged in as, and every slash command with what it does. Asking
//! costs no tokens: nothing is sent to a model, and the process is killed as soon
//! as it answers. So a new model or command shows in trace as soon as the CLI
//! knows it, with no list to keep up to date.
//!
//! It's asked from the home directory, so the commands are the built-in and
//! user-level ones; a project's own commands still reach the chat's `/` menu by
//! name, from the running agent's `init` (`SessionInfo::slash_commands`).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::{build_effective_cli_env, MODEL_OVERRIDE_ENV_PREFIXES};

/// One model Claude Code offers (`ClaudeModel` in ipc/claudeCatalog.ts).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeModel {
    /// What `--model` takes: an alias (`opus`) or a full id (`claude-fable-5-2`).
    pub value: String,
    /// The CLI's own name for it ("Opus 5.5").
    pub display_name: String,
    pub description: String,
    /// The id an alias stands for (`opus` → `claude-opus-5-5`): what a running
    /// agent reports, so the picker can tell it's the same model.
    pub resolved_model: String,
}

/// One slash command Claude Code offers (`ClaudeCommand` in ipc/claudeCatalog.ts).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCommand {
    /// Without its slash: `compact`, `code-review`.
    pub name: String,
    pub description: String,
    /// What it takes after its name ("[instructions]"), or empty.
    pub argument_hint: String,
}

/// Everything one `initialize` answer says that trace's pickers use.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Catalog {
    pub models: Vec<ClaudeModel>,
    pub commands: Vec<ClaudeCommand>,
}

/// A CLI that hasn't answered by now isn't going to.
const TIMEOUT: Duration = Duration::from_secs(30);
const REQUEST_ID: &str = "trace-catalog";

/// Asked once per launch: new models and commands arrive with a CLI update.
static CACHE: Mutex<Option<Catalog>> = Mutex::new(None);

/// What Claude Code offers, from the cache once asked successfully.
pub async fn get() -> Result<Catalog, String> {
    if let Some(catalog) = CACHE.lock().map_err(|e| e.to_string())?.clone() {
        return Ok(catalog);
    }
    let catalog = tokio::time::timeout(TIMEOUT, ask())
        .await
        .map_err(|_| "Claude Code didn't answer in time.".to_string())??;
    *CACHE.lock().map_err(|e| e.to_string())? = Some(catalog.clone());
    Ok(catalog)
}

/// Start `claude` in stream-json mode, send `initialize`, read until its answer.
async fn ask() -> Result<Catalog, String> {
    let env_map = build_effective_cli_env(&HashMap::new());
    let claude = find_cli_with_env("claude", Some(&env_map))
        .ok_or_else(|| "Could not find the `claude` CLI on PATH.".to_string())?;
    let mut cmd = crate::platform::process::async_command(&claude);
    // A neutral cwd, so no project's settings change what it reports.
    cmd.current_dir(dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));
    cmd.args([
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
    ]);
    cmd.env_clear();
    for (key, value) in &env_map {
        if !MODEL_OVERRIDE_ENV_PREFIXES
            .iter()
            .any(|p| key.starts_with(p))
        {
            cmd.env(key, value);
        }
    }
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run claude: {e}"))?;
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return Err("claude's pipes weren't opened.".to_string());
    };
    let request = serde_json::json!({
        "type": "control_request",
        "request_id": REQUEST_ID,
        "request": { "subtype": "initialize" },
    });
    stdin
        .write_all(format!("{request}\n").as_bytes())
        .await
        .map_err(|e| format!("Couldn't write to claude: {e}"))?;
    let mut lines = BufReader::new(stdout).lines();
    let found = loop {
        let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? else {
            break None;
        };
        if let Some(catalog) = serde_json::from_str::<Value>(&line)
            .ok()
            .and_then(|m| catalog_in(&m))
        {
            break Some(catalog);
        }
    };
    let _ = child.kill().await;
    found.ok_or_else(|| "Claude Code exited without answering.".to_string())
}

fn text(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().to_string()
}

/// What `initialize`'s answer offers; `None` for any other line.
fn catalog_in(m: &Value) -> Option<Catalog> {
    let r = &m["response"];
    if m["type"] != "control_response" || r["request_id"] != REQUEST_ID {
        return None;
    }
    let answer = &r["response"];
    let listed = |key: &str| answer[key].as_array().cloned().unwrap_or_default();
    Some(Catalog {
        models: listed("models").iter().filter_map(model).collect(),
        commands: listed("commands").iter().filter_map(command).collect(),
    })
}

/// "default" is left out: trace's pickers already offer "Default model" (no `--model`).
fn model(v: &Value) -> Option<ClaudeModel> {
    let value = v["value"]
        .as_str()
        .filter(|s| !s.is_empty() && *s != "default")?;
    let display_name = Some(text(v, "displayName"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| value.to_string());
    Some(ClaudeModel {
        value: value.to_string(),
        display_name,
        description: text(v, "description"),
        resolved_model: Some(text(v, "resolvedModel"))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| value.to_string()),
    })
}

fn command(v: &Value) -> Option<ClaudeCommand> {
    let name = v["name"].as_str()?.trim_start_matches('/');
    (!name.is_empty()).then(|| ClaudeCommand {
        name: name.to_string(),
        description: text(v, "description"),
        argument_hint: text(v, "argumentHint"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn answer(response: Value) -> Value {
        json!({ "type": "control_response",
            "response": { "subtype": "success", "request_id": REQUEST_ID, "response": response } })
    }

    #[test]
    fn reads_the_models_from_initializes_answer() {
        let line = answer(json!({ "models": [
            { "value": "default", "displayName": "Default (recommended)" },
            { "value": "opus", "displayName": "Opus 5.5", "description": "Everyday",
              "resolvedModel": "claude-opus-5-5" },
            { "value": "claude-fable-5-2", "displayName": "Fable 5.2" },
            { "value": "claude-new-1" },
            { "displayName": "No value" },
        ] }));
        let models = catalog_in(&line).unwrap_or_default().models;
        let values: Vec<_> = models.iter().map(|m| m.value.as_str()).collect();
        assert_eq!(values, ["opus", "claude-fable-5-2", "claude-new-1"]);
        assert_eq!(models[0].display_name, "Opus 5.5");
        assert_eq!(models[0].description, "Everyday");
        assert_eq!(models[2].display_name, "claude-new-1");
        assert_eq!(models[0].resolved_model, "claude-opus-5-5");
        assert_eq!(models[2].resolved_model, "claude-new-1");
    }

    #[test]
    fn reads_the_commands_with_what_they_do() {
        let line = answer(json!({ "commands": [
            { "name": "compact", "description": "Clear history but keep a summary",
              "argumentHint": "[instructions]" },
            { "name": "/mcp", "description": "Manage MCP servers" },
            { "name": "", "description": "Nameless" },
        ] }));
        let commands = catalog_in(&line).unwrap_or_default().commands;
        let names: Vec<_> = commands.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["compact", "mcp"]);
        assert_eq!(commands[0].argument_hint, "[instructions]");
        assert_eq!(commands[1].argument_hint, "");
    }

    #[test]
    fn other_lines_are_skipped() {
        assert_eq!(
            catalog_in(&json!({ "type": "system", "subtype": "init" })),
            None
        );
        let other = json!({ "type": "control_response",
            "response": { "request_id": "else", "response": { "models": [] } } });
        assert_eq!(catalog_in(&other), None);
    }

    /// Asks the real CLI: `cargo test claude_catalog_live -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn claude_catalog_live() {
        let catalog = get().await.unwrap_or_default();
        println!(
            "{} models, {} commands",
            catalog.models.len(),
            catalog.commands.len()
        );
        assert!(catalog.models.iter().any(|m| m.value == "opus"));
        assert!(catalog.commands.iter().any(|c| c.name == "compact"));
    }
}
