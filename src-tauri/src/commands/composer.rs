//! The chat composer's own needs. Thin wrappers only.

/// Of a draft's attached files, the ones still on disk: a draft kept across a
/// restart can name a paste that's since been swept, or a file moved away.
#[tauri::command]
pub fn existing_attachments(paths: Vec<String>) -> Vec<String> {
    crate::agent_session::attachments::existing(&paths)
}
