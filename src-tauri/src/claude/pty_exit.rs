//! How a PTY's process ended: by itself (the renderer offers a restart) or by a
//! stop from trace. Also closes a PTY whose process has gone, on platforms where
//! the process exiting doesn't end the reader.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::execution::LiveSession;
use crate::platform::ports::ProcessHost;
use crate::platform::Os;
use crate::state::AppState;

/// Workspaces whose process `watch_for_exit` saw end by itself. Its removal of the
/// session is what ends the reader there, so the reader can't tell from the session
/// alone whether this was an exit or a stop.
static NATURAL_EXITS: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn note_natural_exit(workspace_id: &str) {
    if let Ok(mut exits) = NATURAL_EXITS.lock() {
        exits.push(workspace_id.to_string());
    }
}

/// Whether `watch_for_exit` recorded this workspace's process ending, forgetting it.
/// Called as a run ends, and as one starts so a note nobody read can't carry over.
pub fn take_natural_exit(workspace_id: &str) -> bool {
    let Ok(mut exits) = NATURAL_EXITS.lock() else {
        return false;
    };
    let before = exits.len();
    exits.retain(|w| w != workspace_id);
    exits.len() != before
}

/// Take `workspace_id`'s session out of state only if it is still run `run`
/// (`AgentSession::run_id`). A stop followed quickly by a start puts a new session under the same id,
/// and that one must not be torn down for the old process's exit. Dropping the
/// returned session closes its PTY.
pub fn take_session(app: &AppHandle, workspace_id: &str, run: Option<u64>) -> Option<LiveSession> {
    let state = app.try_state::<AppState>()?;
    let mut sessions = state.pty_sessions.lock();
    let owns = sessions
        .get(workspace_id)
        .is_some_and(|s| run.is_none() || s.run_id() == run);
    let session = if owns {
        sessions.remove(workspace_id)
    } else {
        None
    };
    drop(sessions);
    let mut pids = state.child_pids.lock();
    if session.is_some() && (run.is_none() || pids.get(workspace_id).map(|p| u64::from(*p)) == run)
    {
        pids.remove(workspace_id);
    }
    session
}

/// Close the PTY once its process has gone, where exit alone doesn't end the reader:
/// dropping the session closes the console, which gives the pump thread its EOF.
pub fn watch_for_exit(app: AppHandle, workspace_id: String, pid: Option<u32>) {
    let Some(pid) = pid else { return };
    std::thread::spawn(move || {
        while Os::is_alive(pid) {
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
        // The caller registers the session after this returns, so a process that
        // exits at once can get here first.
        for _ in 0..20 {
            if let Some(session) = take_session(&app, &workspace_id, Some(u64::from(pid))) {
                // Say so before the drop ends the reader, which reads this.
                note_natural_exit(&workspace_id);
                drop(session);
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
    });
}
