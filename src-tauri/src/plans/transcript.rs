//! A terminal agent's plans, from its Claude transcript. The PTY is a screen, so
//! the conversation file is the only structured record: each of the agent's hook
//! events (a permission dialog, a dialog answered, a turn's end) reads what the
//! file gained since the last read and captures from it (`capture`).

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use super::capture::{self, Found};
use crate::claude::conversations::{conversation_path, session_id_for};
use crate::state::AppState;

/// Where each workspace's last read stopped: the file and its byte offset. Not
/// saved: after a restart the file is read from the start once, and anything
/// already captured is known by its reference.
static OFFSETS: Mutex<Option<HashMap<String, (PathBuf, u64)>>> = Mutex::new(None);

/// Read what `workspace_id`'s conversation gained and capture from it. `turn_end`
/// marks a turn that just ended. Runs on its own thread: hooks mustn't wait.
pub fn scan(app: &AppHandle, workspace_id: &str, turn_end: bool) {
    let app = app.clone();
    let ws = workspace_id.to_string();
    std::thread::spawn(move || {
        // One scan at a time, read to applied, so two close hook events can't
        // apply what they read out of order (an older task list last).
        static SCANNING: Mutex<()> = Mutex::new(());
        let _one = SCANNING.lock().unwrap_or_else(|e| e.into_inner());
        let Some(path) = conversation_file(&app, &ws) else {
            return;
        };
        let mut finds = read_new(&ws, &path);
        if turn_end {
            finds.push(Found::TurnEnd);
        }
        let effects = capture::apply_all(&ws, finds);
        super::apply(&app, &ws, effects);
    });
}

/// A terminal agent's `PermissionRequest` hook input (base64 JSON): a plan dialog
/// opening is the plan, at once.
pub fn on_permission(app: &AppHandle, workspace_id: &str, payload: &str) {
    use base64::Engine;
    let input = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .ok()
        .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok());
    let Some(found) = input.as_ref().and_then(capture::from_permission) else {
        return;
    };
    let effects = capture::apply_all(workspace_id, vec![found]);
    super::apply(app, workspace_id, effects);
}

fn conversation_file(app: &AppHandle, workspace_id: &str) -> Option<PathBuf> {
    let (cwd, _) = crate::commands::workspace::locate(workspace_id)?;
    let saved = conversation_path(&cwd, &session_id_for(workspace_id)?)?;
    let state = app.state::<AppState>();
    Some(crate::claude::transcript::live::current(
        &state,
        workspace_id,
        saved,
    ))
}

/// What the file says past the last read, up to its last whole line. Reads for
/// one workspace are serialised (the lock is held throughout), so two hook events
/// close together can't capture the same lines twice.
fn read_new(workspace_id: &str, path: &Path) -> Vec<Found> {
    let mut guard = OFFSETS.lock().unwrap_or_else(|e| e.into_inner());
    let offsets = guard.get_or_insert_with(HashMap::new);
    let start = match offsets.get(workspace_id) {
        Some((p, at)) if p == path => *at,
        _ => 0,
    };
    let Some((next, text)) = read_from(path, start) else {
        return Vec::new();
    };
    offsets.insert(workspace_id.to_string(), (path.to_path_buf(), next));
    text.lines()
        .flat_map(capture::from_transcript_line)
        .collect()
}

/// The file from `start` to its last newline, and where that ends. A file shorter
/// than `start` was rewritten, so it's read from the beginning.
fn read_from(path: &Path, start: u64) -> Option<(u64, String)> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = if start > len { 0 } else { start };
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    let complete = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    let text = String::from_utf8_lossy(&bytes[..complete]).into_owned();
    Some((start + complete as u64, text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn each_read_takes_only_new_whole_lines() {
        let dir =
            std::env::temp_dir().join(format!("trace-plan-scan-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("conv.jsonl");
        let line = |id: &str| {
            format!(
                "{}\n",
                serde_json::json!({"type": "assistant", "message": {"content": [
                    {"type": "tool_use", "id": id, "name": "ExitPlanMode", "input": {"plan": "# P"}}
                ]}})
            )
        };
        std::fs::write(&path, line("a")).unwrap();
        assert_eq!(read_new("ws-scan", &path).len(), 1);
        assert!(read_new("ws-scan", &path).is_empty());
        // A half-written line waits for its newline.
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap();
        let next = line("b");
        f.write_all(&next.as_bytes()[..10]).unwrap();
        assert!(read_new("ws-scan", &path).is_empty());
        f.write_all(&next.as_bytes()[10..]).unwrap();
        assert_eq!(read_new("ws-scan", &path).len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
