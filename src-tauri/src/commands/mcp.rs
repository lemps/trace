//! Integrations → MCP servers: the HTTP MCP servers configured on this
//! machine, and trace's own logins to them, which agents in a cloud sandbox
//! use (`mcp_auth`). Thin wrappers; anything that reaches a server runs off
//! the async runtime. No token is ever returned.

use tauri::AppHandle;

use crate::mcp_auth::{self, flow, store, ServerStatus};

#[tauri::command]
pub async fn mcp_servers() -> Result<Vec<ServerStatus>, String> {
    tauri::async_runtime::spawn_blocking(mcp_auth::statuses)
        .await
        .map_err(|e| e.to_string())
}

/// Log in to one through the browser. `client_id` is for a server that can't
/// register trace itself (the error says `needs-client-id`).
#[tauri::command]
pub async fn mcp_connect(
    app: AppHandle,
    name: String,
    url: String,
    client_id: Option<String>,
) -> Result<Vec<ServerStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        flow::connect(&app, &name, &url, client_id.as_deref())?;
        Ok(mcp_auth::statuses())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Forget trace's login to one (the server keeps its own record of the grant).
#[tauri::command]
pub async fn mcp_disconnect(url: String) -> Result<Vec<ServerStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        store::forget(&url)?;
        Ok(mcp_auth::statuses())
    })
    .await
    .map_err(|e| e.to_string())?
}
