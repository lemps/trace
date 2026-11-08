//! A workspace's agent options (model, effort, permission mode), picked in the
//! chat composer. Thin wrappers over `agent_session::options`.

use serde::Serialize;
use tauri::State;

use crate::agent_session::options::{self, store, AgentOptions};
use crate::state::AppState;

/// `set_agent_option`'s answer (`SetAgentOptionResult` in ipc/agentOptions.ts).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetResult {
    /// Everything now saved for the workspace.
    pub options: AgentOptions,
    /// The running agent took the pick; otherwise it applies on its next start.
    pub live: bool,
}

/// The options picked for a workspace (empty when none were).
#[tauri::command]
pub fn agent_options(workspace_id: String) -> AgentOptions {
    store::stored(&workspace_id)
}

/// Pick one of a workspace's options (`kind`: "model", "effort" or
/// "permissionMode"): saved for every start, and sent to its running chat
/// agent where the CLI can switch mid-session.
#[tauri::command]
pub fn set_agent_option(
    state: State<'_, AppState>,
    workspace_id: String,
    kind: String,
    value: String,
) -> Result<SetResult, String> {
    let (options, live) = options::pick(&state, &workspace_id, &kind, value)?;
    Ok(SetResult { options, live })
}
