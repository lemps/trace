//! How far each remote chat's output has become journal rows here: the command
//! it came from and the bytes of its stdout read. A chat left running in a
//! sandbox replays its output from the start when rejoined, so this is what a
//! rejoin skips. A trace that has no record (another computer) skips nothing
//! and rebuilds the chat from the replay, which is what it needs.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Offset {
    pub command: String,
    pub stdout: u64,
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("remote-chat-offsets.json")
}

/// Bytes of `command`'s stdout already read for `workspace_id` (0 if none).
pub fn read(workspace_id: &str, command: &str) -> u64 {
    persist::read_or_log::<HashMap<String, Offset>>(&path())
        .get(workspace_id)
        .filter(|o| o.command == command)
        .map_or(0, |o| o.stdout)
}

/// Record how far `workspace_id`'s chat has read. Best-effort.
pub fn write(workspace_id: &str, command: &str, stdout: u64) {
    let _ = persist::update(
        &path(),
        Style::Compact,
        |map: &mut HashMap<String, Offset>| {
            map.insert(
                workspace_id.to_string(),
                Offset {
                    command: command.to_string(),
                    stdout,
                },
            );
        },
    );
}
