//! Codex thread ids per workspace, so a chat agent started again resumes its
//! thread. Kept apart from Claude's `sessions.json`: a Claude terminal agent on
//! the same workspace must never `--resume` a Codex id.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::helpers::persist::{self, Style};

fn threads_file() -> PathBuf {
    crate::helpers::trace_dir().join("codex-threads.json")
}

/// The workspace's saved thread, if it has one.
pub fn saved(workspace_id: &str) -> Option<String> {
    persist::read_or_log::<HashMap<String, String>>(&threads_file())
        .get(workspace_id)
        .cloned()
}

/// Remember the workspace's thread. A no-op when it's already the saved one.
pub fn save(workspace_id: &str, thread_id: &str) -> Result<(), String> {
    persist::update(
        &threads_file(),
        Style::Compact,
        |map: &mut HashMap<String, String>| {
            if map.get(workspace_id).map(String::as_str) != Some(thread_id) {
                map.insert(workspace_id.to_string(), thread_id.to_string());
            }
        },
    )
}

#[cfg(test)]
pub fn forget(workspace_id: &str) -> Result<(), String> {
    persist::update(
        &threads_file(),
        Style::Compact,
        |map: &mut HashMap<String, String>| {
            map.remove(workspace_id);
        },
    )
}
