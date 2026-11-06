//! A live agent's conversation as structured items, for the formatted view.
//!
//! The PTY byte stream is a screen, never parsed for structure. Claude Code writes
//! the conversation itself as JSONL (`conversations::conversation_path`), one entry
//! per line and appended as the turn goes, so the formatted view tails that file:
//! each read starts at the byte offset the last one stopped at and only parses
//! whole lines, which keeps a poll of a long conversation cheap.
//!
//! Unlike `conversation_log` (a finished run's readable summary), this keeps tool
//! calls with their inputs and results, slash commands and turn boundaries — what
//! a transcript needs to show *what the agent did*, not just what it said.

mod parse;
#[cfg(test)]
mod tests;

use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use serde::Serialize;

/// Items returned by one read, newest-biased: a first read of a conversation with
/// thousands of tool calls only needs the recent end to be useful.
const MAX_ITEMS: usize = 1500;

/// Longest text kept per field; a pasted file or a huge tool output is cut.
const MAX_TEXT: usize = 8_000;

/// Longest tool result kept — results are the bulkiest part and are shown folded.
const MAX_RESULT: usize = 4_000;

/// One displayable piece of the conversation. `id` is stable across reads (the
/// entry's uuid plus the block's index), so the renderer can key and dedupe on it.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum TranscriptItem {
    /// What the user typed (or a queued / suggested prompt they accepted).
    Prompt {
        id: String,
        text: String,
        at: Option<String>,
    },
    /// Claude's prose, as Markdown.
    Reply {
        id: String,
        text: String,
        at: Option<String>,
    },
    /// A tool call. `input` is the call's arguments with long strings clipped.
    ToolCall {
        id: String,
        tool_use_id: String,
        name: String,
        input: serde_json::Value,
        at: Option<String>,
    },
    /// The result of the call whose `tool_use_id` matches.
    ToolResult {
        id: String,
        tool_use_id: String,
        text: String,
        is_error: bool,
    },
    /// A slash command the user ran, e.g. `/compact focus on tests`.
    Command { id: String, text: String },
    /// Something the harness reported: compaction, an interrupt, a background
    /// task finishing, a local command's output.
    Notice { id: String, text: String },
    /// A turn finished; how long it took.
    TurnEnd { id: String, duration_ms: u64 },
}

/// What one read returns. `offset` is where the next read should start;
/// `reset` says the items replace (rather than extend) what the caller holds —
/// a different conversation, or a file that shrank.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPage {
    pub session_id: String,
    pub offset: u64,
    pub reset: bool,
    pub items: Vec<TranscriptItem>,
}

/// Read a workspace's conversation from `offset` on. `known_session` is the
/// conversation the caller's offset belongs to; a different one restarts at 0.
/// `None` when the conversation isn't on disk yet (Claude writes it lazily, on
/// the first message).
pub fn read_page(
    cwd: &str,
    session_id: &str,
    known_session: Option<&str>,
    offset: u64,
) -> Option<TranscriptPage> {
    let path = super::conversations::conversation_path(cwd, session_id)?;
    let same = known_session == Some(session_id);
    read_file(&path, if same { offset } else { 0 }, !same).map(|(offset, reset, items)| {
        TranscriptPage {
            session_id: session_id.to_string(),
            offset,
            reset,
            items,
        }
    })
}

/// Parse `path` from `offset` up to its last complete line. Returns the next
/// offset, whether this restarted from 0, and the items.
fn read_file(path: &Path, offset: u64, reset: bool) -> Option<(u64, bool, Vec<TranscriptItem>)> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    // A file shorter than the caller's offset was rewritten: start over.
    let (start, reset) = if offset > len {
        (0, true)
    } else {
        (offset, reset)
    };
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::with_capacity((len - start) as usize);
    file.read_to_end(&mut bytes).ok()?;
    // Only whole lines: the last one may still be mid-write.
    let complete = bytes.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    let text = String::from_utf8_lossy(&bytes[..complete]);
    let mut items: Vec<TranscriptItem> = text.lines().flat_map(parse::line).collect();
    if items.len() > MAX_ITEMS {
        items.drain(..items.len() - MAX_ITEMS);
    }
    Some((start + complete as u64, reset, items))
}

/// Cut `text` to `max` characters, marking the cut.
fn clip(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        None => text.to_string(),
        Some((at, _)) => format!("{}…", &text[..at]),
    }
}
