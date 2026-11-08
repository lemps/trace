//! Tailscale status for the Integrations page: is it installed and connected,
//! and which devices share the tailnet. Thin wrapper over
//! `execution::peer::tailscale`; the CLI runs on `spawn_blocking`.

use crate::execution::peer::tailscale::{self, TailscaleStatus};

#[tauri::command]
pub async fn tailscale_status() -> Result<TailscaleStatus, String> {
    tauri::async_runtime::spawn_blocking(tailscale::status)
        .await
        .map_err(|e| format!("Couldn't ask Tailscale: {e}"))
}
