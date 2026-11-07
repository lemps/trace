//! Which agent brands run on the chat transport, and the one place a start
//! picks an adapter by its `cli` ("claude", "codex"). Adding a brand is an
//! entry here plus its adapter module.

use std::sync::Arc;

use tauri::AppHandle;

use super::claude::ClaudeAdapter;
use super::codex::CodexAdapter;
use super::{AgentAdapter, JournalSink, LaunchSpec};
use crate::claude::launch::Wiring;
use crate::state::AppState;

/// The CLIs that can run as a chat agent. Every other brand runs in a terminal.
pub const CHAT_BRANDS: [&str; 2] = ["claude", "codex"];

/// Whether `cli` can run on the chat transport.
pub fn supports_chat(cli: &str) -> bool {
    CHAT_BRANDS.contains(&cli)
}

/// What trace adds to a `cli` chat agent: Claude's tools, hooks and provider
/// (`claude::launch`); for Codex the render bridge and trace's tools as `-c`
/// overrides (`codex_wiring`). Providers are Anthropic-compatible endpoints, so
/// Codex has none; hooks are Claude's `--settings`.
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
        "claude" => crate::claude::launch::claude_wiring(
            app,
            state,
            workspace_id,
            model,
            provider,
            extra_args,
        ),
        "codex" => Ok(crate::claude::launch::codex_wiring(
            app,
            state,
            workspace_id,
            model,
            extra_args,
        )),
        other => Err(unsupported(other)),
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
        "codex" => Ok(Box::new(CodexAdapter::launch(spec, sink)?)),
        other => Err(unsupported(other)),
    }
}

/// The conversation a `cli` chat agent for `workspace_id` in `cwd` would
/// resume, if any: whether its start sends the kickoff brief or the resume prompt.
pub fn resumable(cli: &str, workspace_id: &str, cwd: &str) -> Option<String> {
    match cli {
        "claude" => crate::claude::conversations::resumable(workspace_id, cwd),
        "codex" => super::codex::threads::saved(workspace_id),
        _ => None,
    }
}

fn unsupported(cli: &str) -> String {
    format!("{cli} can't run as a chat agent yet; start it in a terminal.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_and_codex_run_as_chat() {
        assert!(supports_chat("claude"));
        assert!(supports_chat("codex"));
        assert!(!supports_chat("gemini"));
    }
}
