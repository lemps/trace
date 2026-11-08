//! Preflight checks for the first run and the launch notice. Thin wrapper over
//! `preflight::run`, which blocks while it spawns `gh` and a login shell.

use crate::preflight::{self, checks::Check};

#[tauri::command]
pub async fn preflight_checks() -> Result<Vec<Check>, String> {
    tauri::async_runtime::spawn_blocking(preflight::run)
        .await
        .map_err(|e| format!("Couldn't run the setup checks: {e}"))
}
