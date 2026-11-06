//! The formatted view's feed: a workspace's Claude conversation, read
//! incrementally from Claude Code's own transcript (`claude::transcript`).

use crate::claude::conversations::session_id_for;
use crate::claude::transcript::{self, TranscriptPage};

/// Read `workspace_id`'s conversation from `offset` on. `session_id` is the
/// conversation the caller's items came from (null on a first read); when the
/// workspace has moved to another one, the page restarts with `reset`.
/// `None` until the agent has a conversation on disk — codex never does.
#[tauri::command]
pub async fn read_transcript(
    workspace_id: String,
    session_id: Option<String>,
    offset: u64,
) -> Result<Option<TranscriptPage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (cwd, _) = crate::commands::workspace::locate(&workspace_id)?;
        let conversation = session_id_for(&workspace_id)?;
        transcript::read_page(&cwd, &conversation, session_id.as_deref(), offset)
    })
    .await
    .map_err(|e| e.to_string())
}
