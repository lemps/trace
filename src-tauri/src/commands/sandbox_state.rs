//! A sandbox session's sandbox as its provider reports it now, for the
//! session's Details: running or stopped, saved or not, and when each ends.
//! The words for it are the renderer's (`sessions/sessionHost.ts`).

use serde::Serialize;

use crate::commands::session::owning_session;
use crate::execution::sandbox::{SandboxInfo, SandboxProvider};
use crate::execution::vercel::{auth, Vercel};
use crate::execution::SessionHost;

/// What the provider says about a session's sandbox.
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SandboxState {
    /// The provider's word ("running", "stopped", "snapshotting", …); empty
    /// when there's no sandbox (never started, or deleted).
    status: String,
    /// It has a snapshot that Start resumes from.
    saved: bool,
    /// Epoch ms when the provider stops the current run, if it says.
    stops_at: Option<u64>,
    /// Epoch ms when the snapshot expires, if it says.
    saved_until: Option<u64>,
}

fn state_of(found: Option<SandboxInfo>) -> SandboxState {
    match found {
        Some(info) => SandboxState {
            status: info.status,
            saved: info.saved,
            stops_at: info.stops_at,
            saved_until: info.saved_until,
        },
        None => SandboxState {
            status: String::new(),
            saved: false,
            stops_at: None,
            saved_until: None,
        },
    }
}

/// `workspace_id`'s sandbox now; None when the session runs on this computer.
/// One provider call, off the async runtime.
#[tauri::command]
pub async fn sandbox_state(workspace_id: String) -> Result<Option<SandboxState>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(SessionHost::Vercel { sandbox, .. }) =
            owning_session(&workspace_id).and_then(|s| s.host)
        else {
            return Ok(None);
        };
        let conn = auth::load().ok_or("Connect Vercel in Integrations first.")?;
        Vercel::new(conn).find(&sandbox).map(|f| Some(state_of(f)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_sandbox_reads_as_an_empty_status() {
        let state = state_of(None);
        assert_eq!(state.status, "");
        assert!(!state.saved);
    }

    #[test]
    fn reaches_the_renderer_in_camel_case() {
        let json = serde_json::to_value(state_of(None)).unwrap_or_default();
        assert!(json.get("stopsAt").is_some() && json.get("savedUntil").is_some());
    }
}
