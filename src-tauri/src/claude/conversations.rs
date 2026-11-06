//! Claude conversation ids per workspace.
//!
//! The raw PTY byte stream gives no way to read back the id of a conversation
//! Claude generated, so trace pins one up front (`--session-id`) and persists the
//! workspace → id map, letting the next start `--resume` it. Shared by board
//! agents, exploratory sessions (and their companions) and scheduled runs.

use std::collections::HashMap;
use std::path::PathBuf;

use crate::helpers::new_id;
use crate::helpers::persist::{self, Style};

// We pin a Claude session id per Jira issue the first time the user starts a
// session on it, and persist the map across launches. Subsequent starts on the
// same issue pass `--resume <id>` so the conversation continues where it left
// off rather than starting fresh. Codex manages its own session state and is
// skipped here.

fn sessions_file() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("trace")
        .join("sessions.json")
}

/// Every load→mutate→save cycle on `sessions.json`. Two agents starting concurrently
/// (the start guard is per-issue, not global, and there may be a second trace) would
/// otherwise read the same snapshot and the second write would drop the first one's
/// mapping.
fn update<R>(f: impl FnOnce(&mut HashMap<String, String>) -> R) -> Result<R, String> {
    persist::update(&sessions_file(), Style::Compact, f)
}

pub(crate) fn session_id_for(issue_key: &str) -> Option<String> {
    persist::read_or_log::<HashMap<String, String>>(&sessions_file())
        .get(issue_key)
        .cloned()
}

pub(crate) fn upsert_session_id(issue_key: &str, id: &str) -> Result<(), String> {
    update(|map| {
        map.insert(issue_key.to_string(), id.to_string());
    })
}

/// Transfer a saved Claude conversation id to a new workspace key (used when
/// an exploratory session is linked to an issue — same conversation, new owner).
pub(crate) fn move_session_id(from: &str, to: &str) -> Result<(), String> {
    update(|map| {
        if let Some(claude_id) = map.remove(from) {
            map.insert(to.to_string(), claude_id);
        }
    })
}

pub(crate) fn forget_session_id(issue_key: &str) -> Result<(), String> {
    update(|map| {
        map.remove(issue_key);
    })
}

/// Claude stores each conversation at `~/.claude/projects/<cwd-slug>/<id>.jsonl`,
/// where the slug is the cwd with every `/` and `.` replaced by `-`.
pub(crate) fn claude_conversation_exists(cwd: &str, session_id: &str) -> bool {
    conversation_path(cwd, session_id).is_some_and(|p| p.exists())
}

/// Where Claude keeps a conversation: `~/.claude/projects/<cwd-slug>/<id>.jsonl`,
/// the slug being the cwd with every `/` and `.` replaced by `-`.
pub(crate) fn conversation_path(cwd: &str, session_id: &str) -> Option<PathBuf> {
    let slug: String = cwd
        .chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect();
    Some(
        dirs::home_dir()?
            .join(".claude")
            .join("projects")
            .join(slug)
            .join(format!("{session_id}.jsonl")),
    )
}

/// Resolve the Claude `--resume`/`--session-id` args for a workspace: resume a
/// saved conversation, or pin (and persist) a fresh id. Codex manages its own
/// session state, so it gets neither. Shared by issue agents (`start_agent`) and
/// exploratory sessions (`start_session`).
///
/// A stored id is only resumed if its conversation actually exists on disk.
/// Claude writes the conversation file lazily (on the first message), so a
/// session opened and closed without interaction leaves a "poisoned" id —
/// persisted here but unknown to Claude, which would make `--resume` fail with
/// "No conversation found". We detect that and self-heal by pinning a fresh id.
pub(crate) fn claude_session_ids(
    workspace_id: &str,
    cli: &str,
    cwd: &str,
) -> (Option<String>, Option<String>) {
    if cli != "claude" {
        return (None, None);
    }
    // Unreadable isn't "no saved conversation": pinning a fresh id could replace the
    // real one once the read recovers. This start just runs without a pinned id.
    let saved = persist::read_or_default::<HashMap<String, String>>(&sessions_file());
    let saved = match saved {
        Ok(map) => map.get(workspace_id).cloned(),
        Err(e) => {
            eprintln!("trace: {e}");
            return (None, None);
        }
    };
    if let Some(prev) = saved {
        if claude_conversation_exists(cwd, &prev) {
            return (Some(prev), None);
        }
        // Poisoned id — fall through and replace it with a fresh, usable one.
    }
    let fresh = new_id();
    let _ = upsert_session_id(workspace_id, &fresh);
    (None, Some(fresh))
}
