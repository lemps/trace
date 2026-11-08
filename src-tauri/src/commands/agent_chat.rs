//! Chat agents: talk to one, and read its journal and state. Thin wrappers
//! over `agent_session::runtime`; see docs/AGENT_CHAT.md. A chat agent starts,
//! stops and resumes through the same commands as a terminal one
//! (`start_agent`, `start_session`, `stop_agent`, …), which pick the transport.

use tauri::State;

use crate::agent_session::journal::{Answer, JournalRow};
use crate::agent_session::runtime::{self, ChatAgentState};
use crate::agent_session::transport::Transport;
use crate::agent_session::UserMessage;
use crate::state::AppState;

/// The workspace's chat agent as it is now: its transport, whether one runs,
/// and what it last reported. What a view reads on mount, so a reload or an
/// agent started before the view subscribed still shows as a chat.
#[tauri::command]
pub fn chat_agent_state(state: State<'_, AppState>, workspace_id: String) -> ChatAgentState {
    runtime::current(&state, &workspace_id)
}

/// The CLIs that can run as a chat agent; the rest run in a terminal.
#[tauri::command]
pub fn chat_agent_brands() -> Vec<&'static str> {
    crate::agent_session::brands::CHAT_BRANDS.to_vec()
}

/// Choose a workspace's transport before its agent first starts (the New
/// session dialog). Its next start runs on it.
#[tauri::command]
pub fn set_agent_transport(workspace_id: String, transport: String) -> Result<(), String> {
    let transport = Transport::parse(&transport).ok_or("Unknown transport.")?;
    crate::agent_session::transport::remember(&workspace_id, transport);
    Ok(())
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

/// Save a file pasted or dropped into the composer (raw bytes, its name in the
/// `x-file-name` header) and return the path to attach. Picked files need no
/// saving: they're attached by their own path.
#[tauri::command]
pub async fn save_chat_attachment(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes.".to_string());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("attachment")
        .to_string();
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::agent_session::attachments::save(&name, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
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

/// Stop one subagent (by the call that started it); the agent and its turn go on.
#[tauri::command]
pub fn stop_chat_subagent(
    state: State<'_, AppState>,
    workspace_id: String,
    call_id: String,
) -> Result<(), String> {
    runtime::stop_subagent(&state, &workspace_id, &call_id)
}

/// The workspace's journal, each row at its latest revision, in order.
#[tauri::command]
pub fn load_journal(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<JournalRow>, String> {
    runtime::load(&state, &workspace_id)
}
