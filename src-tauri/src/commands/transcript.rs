//! The formatted view's feed: a workspace's Claude conversation, read
//! incrementally from Claude Code's own transcript (`claude::transcript`).

use tauri::State;

use crate::claude::conversations::{conversation_path, session_id_for};
use crate::claude::transcript::{self, live, TranscriptPage};
use crate::state::AppState;

/// Read `workspace_id`'s conversation from `offset` on. `session_id` is the
/// conversation the caller's items came from (null on a first read); when the
/// agent has moved to another one (a new start, `/clear`), the page restarts
/// with `reset`. `None` until the agent has a conversation on disk — codex
/// never does.
#[tauri::command]
pub async fn read_transcript(
    state: State<'_, AppState>,
    workspace_id: String,
    session_id: Option<String>,
    offset: u64,
) -> Result<Option<TranscriptPage>, String> {
    let Some((cwd, _)) = crate::commands::workspace::locate(&workspace_id) else {
        return Ok(None);
    };
    let saved = session_id_for(&workspace_id).and_then(|id| conversation_path(&cwd, &id));
    let Some(saved) = saved else {
        return Ok(None);
    };
    let path = live::current(&state, &workspace_id, saved);
    tauri::async_runtime::spawn_blocking(move || {
        // Not written yet is "no conversation"; there but unreadable is an error,
        // so the renderer keeps what it has and tries again on its next poll.
        if !path.exists() {
            return Ok(None);
        }
        transcript::read_page(&path, session_id.as_deref(), offset)
            .map(Some)
            .ok_or_else(|| "Couldn't read the conversation file.".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
