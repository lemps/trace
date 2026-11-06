//! Which file a running agent's conversation is in *now*.
//!
//! trace pins the conversation id at spawn (`conversations`), but the user can
//! move a running agent to another one from inside the TUI — `/clear` starts a
//! fresh conversation file, `/resume` switches to an old one — and the saved id
//! never hears about it. Every hook event Claude fires carries the file it is
//! writing (`transcript_path`), so the latest one reported wins.

use std::path::{Path, PathBuf};

use crate::state::AppState;

/// Remember the conversation file a hook event from `workspace_id` named.
pub fn note(state: &AppState, workspace_id: &str, transcript_path: &str) {
    state
        .live_transcripts
        .lock()
        .insert(workspace_id.to_string(), transcript_path.to_string());
}

/// Forget it — a new spawn starts on its own pinned conversation.
pub fn forget(state: &AppState, workspace_id: &str) {
    state.live_transcripts.lock().remove(workspace_id);
}

/// The file to read for `workspace_id`: the one its hooks last named, else the
/// saved conversation's. A reported path is only trusted when it's a `.jsonl`
/// in the same project folder as the saved one, which is where `/clear` and
/// `/resume` land: the hook relay is authenticated, but this keeps the reader
/// from ever being pointed at an arbitrary file.
pub fn current(state: &AppState, workspace_id: &str, saved: PathBuf) -> PathBuf {
    let reported = state.live_transcripts.lock().get(workspace_id).cloned();
    match reported {
        Some(path) if is_sibling(Path::new(&path), &saved) => PathBuf::from(path),
        _ => saved,
    }
}

fn is_sibling(path: &Path, saved: &Path) -> bool {
    let same_dir = match (path.parent(), saved.parent()) {
        (Some(a), Some(b)) => same_path(a, b),
        _ => false,
    };
    same_dir && path.extension().is_some_and(|e| e == "jsonl")
}

/// Paths compared as written: separators and (Windows) case can differ between
/// what Claude reports and what trace builds.
fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().replace('\\', "/").to_lowercase();
    norm(a) == norm(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reported_file_counts_only_beside_the_saved_one() {
        let state = AppState::new();
        let saved = PathBuf::from("/h/.claude/projects/-repo/old.jsonl");
        assert_eq!(current(&state, "ws", saved.clone()), saved);

        note(&state, "ws", "/h/.claude/projects/-repo/new.jsonl");
        assert_eq!(
            current(&state, "ws", saved.clone()),
            PathBuf::from("/h/.claude/projects/-repo/new.jsonl")
        );

        // Somewhere else, or not a conversation file: ignored.
        note(&state, "ws", "/etc/passwd");
        assert_eq!(current(&state, "ws", saved.clone()), saved);
        note(&state, "ws", "/h/.claude/projects/-repo/notes.txt");
        assert_eq!(current(&state, "ws", saved.clone()), saved);

        // Claude's separators and case needn't match trace's.
        note(&state, "w2", "/H/.claude/projects/-repo/new.jsonl");
        assert!(current(&state, "w2", saved.clone()).ends_with("new.jsonl"));

        forget(&state, "ws");
        assert_eq!(current(&state, "ws", saved.clone()), saved);
    }
}
