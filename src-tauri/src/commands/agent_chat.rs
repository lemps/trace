//! Chat agents: start one headless over stream-json, talk to it, and read its
//! journal. Thin wrappers over `agent_session::runtime`; see docs/AGENT_CHAT.md.

use tauri::{AppHandle, State};

use crate::agent_session::journal::{Answer, JournalRow};
use crate::agent_session::runtime::{self, StartRequest};
use crate::agent_session::UserMessage;
use crate::state::{AppState, StartGuard};

/// Start a chat agent for an issue (in its worktree) or a session (where the
/// session runs). Idempotent: a no-op while one runs.
#[tauri::command]
pub fn start_chat_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
    model: Option<String>,
    provider: Option<String>,
    extra_args: Option<Vec<String>>,
    // An issue's summary + labels, for repo mappings (as `start_agent`).
    match_text: Option<String>,
) -> Result<(), String> {
    if state.pty_sessions.lock().contains_key(&workspace_id) {
        return Err("This agent is running in a terminal. Stop it first.".to_string());
    }
    // The same reservation a terminal start takes, so the two can't race into
    // one conversation while a worktree is being made.
    let Some(_guard) = StartGuard::acquire(&state, &workspace_id) else {
        return Ok(());
    };
    let id = workspace_id.clone();
    let cwd = move || {
        if crate::commands::session::is_session(&id) {
            crate::commands::session::session_cwd(&id, true)
        } else {
            crate::commands::agent::issue_worktree(&id, match_text.as_deref().unwrap_or(""))
        }
    };
    let req = StartRequest {
        workspace_id,
        model,
        provider,
        extra_args: extra_args.unwrap_or_default(),
    };
    runtime::start(&app, &state, req, cwd)
}

/// A user turn. Sent while a turn runs, Claude queues it.
#[tauri::command]
pub fn send_chat_message(
    state: State<'_, AppState>,
    workspace_id: String,
    message: UserMessage,
) -> Result<(), String> {
    if message.text.trim().is_empty() && message.attachments.is_empty() {
        return Err("Nothing to send.".to_string());
    }
    runtime::send(&state, &workspace_id, message)
}

/// Answer an approval or question row by its `requestId`.
#[tauri::command]
pub fn answer_chat_prompt(
    state: State<'_, AppState>,
    workspace_id: String,
    request_id: String,
    answer: Answer,
) -> Result<(), String> {
    runtime::answer(&state, &workspace_id, &request_id, answer)
}

/// Stop the running turn; the agent stays up.
#[tauri::command]
pub fn interrupt_chat_agent(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<(), String> {
    runtime::interrupt(&state, &workspace_id)
}

/// End the agent. A no-op if none runs.
#[tauri::command]
pub fn stop_chat_agent(state: State<'_, AppState>, workspace_id: String) {
    runtime::stop(&state, &workspace_id);
}

/// The workspace's journal, each row at its latest revision, in order.
#[tauri::command]
pub fn load_journal(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<JournalRow>, String> {
    runtime::load(&state, &workspace_id)
}
