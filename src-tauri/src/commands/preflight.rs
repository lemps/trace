//! Preflight checks for the first run and the launch notice, and the setup
//! list's Install and Sign in buttons. Thin wrappers over `preflight`, which
//! blocks while it spawns CLIs, downloads and installs.

use crate::platform::install_hints::Tool;
use crate::preflight::{self, checks::Check, sign_in::SignInStart};

#[tauri::command]
pub async fn preflight_checks() -> Result<Vec<Check>, String> {
    tauri::async_runtime::spawn_blocking(preflight::run)
        .await
        .map_err(|e| format!("Couldn't run the setup checks: {e}"))
}

/// Install a missing CLI ("claude" or "gh") for this user.
#[tauri::command]
pub async fn preflight_install(tool: String) -> Result<(), String> {
    let tool = parse_tool(&tool)?;
    tauri::async_runtime::spawn_blocking(move || preflight::install::install(tool))
        .await
        .map_err(|e| format!("Couldn't run the installer: {e}"))?
}

/// Start a CLI's browser sign-in ("claude" or "gh"); see `preflight::sign_in`.
#[tauri::command]
pub async fn preflight_sign_in(tool: String) -> Result<SignInStart, String> {
    let tool = parse_tool(&tool)?;
    tauri::async_runtime::spawn_blocking(move || preflight::sign_in::start(tool))
        .await
        .map_err(|e| format!("Couldn't start signing in: {e}"))?
}

/// Stop a sign-in that's waiting on the browser.
#[tauri::command]
pub fn preflight_cancel_sign_in(tool: String) {
    preflight::sign_in::cancel(&tool);
}

fn parse_tool(id: &str) -> Result<Tool, String> {
    match id {
        "claude" => Ok(Tool::Claude),
        "gh" => Ok(Tool::Gh),
        other => Err(format!("trace can't set up {other}.")),
    }
}
