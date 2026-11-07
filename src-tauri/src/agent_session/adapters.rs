//! The brands that can run as a chat agent, and how each one starts. Adding a
//! brand is one entry in `CHAT_BRANDS` and one arm in `launch` (plus its
//! wiring, if trace adds more than the render bridge to it).

use std::sync::Arc;

use tauri::AppHandle;

use super::claude::ClaudeAdapter;
use super::{AgentAdapter, JournalSink, LaunchSpec};
use crate::claude::launch::{self, Wiring};
use crate::state::AppState;

/// CLIs with a chat adapter. Anything else runs in the terminal.
pub const CHAT_BRANDS: &[&str] = &["claude"];

/// Whether `cli` can run as a chat agent.
pub fn has_chat(cli: &str) -> bool {
    CHAT_BRANDS.contains(&cli)
}

/// What trace adds to a `cli` agent before it starts: the same as a terminal
/// agent of that brand gets (`commands::agent::spawn_in`).
pub fn wiring(
    app: &AppHandle,
    state: &AppState,
    cli: &str,
    workspace_id: &str,
    model: Option<String>,
    provider: Option<&str>,
    extra_args: Vec<String>,
) -> Result<Wiring, String> {
    match cli {
        "claude" => launch::claude_wiring(app, state, workspace_id, model, provider, extra_args),
        _ => Ok(Wiring {
            model,
            extra_args,
            env: launch::bridge_env(app, state, workspace_id),
        }),
    }
}

/// Start `cli`'s adapter.
pub fn launch(
    cli: &str,
    spec: LaunchSpec,
    sink: Arc<dyn JournalSink>,
) -> Result<Box<dyn AgentAdapter>, String> {
    match cli {
        "claude" => Ok(Box::new(ClaudeAdapter::launch(spec, sink)?)),
        _ => Err(format!("{cli} can't run as a chat yet.")),
    }
}

/// The conversation a `cli` agent in `cwd` would resume, if any: what decides
/// whether the start sends the kickoff brief or the resume prompt.
pub fn resumable(cli: &str, workspace_id: &str, cwd: &str) -> Option<String> {
    match cli {
        "claude" => crate::claude::conversations::resumable(workspace_id, cwd),
        _ => None,
    }
}
