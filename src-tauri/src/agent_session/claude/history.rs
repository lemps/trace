//! A Claude conversation's turns that no chat run recorded, as journal rows.
//!
//! A chat agent's journal only holds what it saw while it ran: headless Claude
//! resumes a conversation without replaying it. Turns taken in the terminal (or
//! anywhere but a chat run) live only in Claude Code's own conversation file, so
//! a session switched to chat, or back to it, opened with them missing. Each
//! entry there names who wrote it: a chat run is `sdk-cli`, so every other entry
//! is one the journal never saw. They're read with the formatted transcript's
//! parser (`claude::transcript`) and become ordinary rows, ids prefixed `hist:`
//! so a second read finds them already there (`agent_session::backfill`).

use std::io::{BufRead, BufReader};
use std::path::Path;

use serde::Deserialize;

use crate::agent_session::journal::{
    cap, JournalBody, JournalRow, Message, Role, Status, Tone, ToolCall, ToolState, Turn, TurnState,
};
use crate::claude::transcript::{line_items, TranscriptItem};

/// The most rows taken from one conversation: its newest turns, whole. A long
/// terminal session holds thousands of calls; the chat needs the recent end.
const MAX_ROWS: usize = 4000;

/// Who wrote a chat run's entries.
const CHAT_ENTRYPOINT: &str = "sdk-cli";

#[derive(Deserialize)]
struct Head {
    #[serde(default)]
    entrypoint: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
}

/// The rows for every turn in the conversation at `path` that a chat run didn't
/// write, oldest first, with `seq` and `revision` 0 (the journal numbers them).
/// A missing or unreadable file has none.
pub(crate) fn rows(path: &Path) -> Vec<JournalRow> {
    let Ok(file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let mut build = Builder::default();
    for line in BufReader::new(file).lines() {
        // A torn last line (Claude still writing) is read next time.
        let Ok(line) = line else { break };
        // Most of a chat-run conversation: skip it without parsing it.
        if line.contains(r#""entrypoint":"sdk-cli""#) {
            continue;
        }
        let Ok(head) = serde_json::from_str::<Head>(&line) else {
            continue;
        };
        if head.entrypoint.as_deref() == Some(CHAT_ENTRYPOINT) {
            continue;
        }
        let at = head.timestamp.as_deref().and_then(millis).unwrap_or(0);
        for item in line_items(&line) {
            build.item(item, at);
        }
    }
    build.finish()
}

fn millis(timestamp: &str) -> Option<u64> {
    let t = chrono::DateTime::parse_from_rfc3339(timestamp).ok()?;
    u64::try_from(t.timestamp_millis()).ok()
}

/// One turn's rows, its prompt first and its `turn` row last.
struct OpenTurn {
    id: String,
    rows: Vec<JournalRow>,
    /// When its last row was written, for its `turn` row.
    last_at: u64,
}

#[derive(Default)]
struct Builder {
    done: Vec<Vec<JournalRow>>,
    turn: Option<OpenTurn>,
}

impl Builder {
    fn item(&mut self, item: TranscriptItem, at: u64) {
        match item {
            TranscriptItem::Prompt { id, text, .. } => {
                self.close(None);
                self.push(at, &id, "user", message(Role::User, text));
            }
            // A slash command is something the user did: it opens a turn too.
            TranscriptItem::Command { id, text } => {
                self.close(None);
                self.push(at, &id, "user", message(Role::User, text));
            }
            TranscriptItem::Reply { id, text, .. } => {
                self.push(at, &id, "reply", message(Role::Assistant, text));
            }
            TranscriptItem::ToolCall {
                tool_use_id,
                name,
                input,
                ..
            } => {
                let body = JournalBody::Tool(ToolCall {
                    call_id: tool_use_id.clone(),
                    name,
                    input,
                    state: ToolState::Completed,
                    output: None,
                    parent_call_id: None,
                    subagent: None,
                });
                self.push(at, &tool_use_id, "tool", body);
            }
            TranscriptItem::ToolResult {
                tool_use_id,
                text,
                is_error,
                ..
            } => self.result(&tool_use_id, text, is_error),
            TranscriptItem::Notice { id, text } => {
                let body = JournalBody::Status(Status {
                    text,
                    tone: Tone::Info,
                });
                self.push(at, &id, "note", body);
            }
            TranscriptItem::TurnEnd { duration_ms, .. } => self.close(Some(duration_ms)),
        }
    }

    /// Add a row to the open turn, opening one if the conversation went on
    /// without a prompt (a resumed turn, a background task reporting back).
    fn push(&mut self, at: u64, id: &str, kind: &str, body: JournalBody) {
        let turn = self.turn.get_or_insert_with(|| OpenTurn {
            id: format!("hist-{id}"),
            rows: Vec::new(),
            last_at: at,
        });
        turn.last_at = turn.last_at.max(at);
        turn.rows.push(JournalRow {
            id: format!("hist:{kind}:{id}"),
            revision: 0,
            seq: 0,
            at,
            turn_id: Some(turn.id.clone()),
            body,
        });
    }

    /// A call's result lands on its row.
    fn result(&mut self, call_id: &str, text: String, is_error: bool) {
        let Some(turn) = self.turn.as_mut() else {
            return;
        };
        let row_id = format!("hist:tool:{call_id}");
        let Some(row) = turn.rows.iter_mut().rev().find(|r| r.id == row_id) else {
            return;
        };
        if let JournalBody::Tool(call) = &mut row.body {
            call.output = (!text.is_empty()).then(|| cap(&text));
            if is_error {
                call.state = ToolState::Failed;
            }
        }
    }

    /// End the open turn with its `turn` row.
    fn close(&mut self, duration_ms: Option<u64>) {
        let Some(mut turn) = self.turn.take() else {
            return;
        };
        turn.rows.push(JournalRow {
            id: format!("turn:{}", turn.id),
            revision: 0,
            seq: 0,
            at: turn.last_at,
            turn_id: Some(turn.id.clone()),
            body: JournalBody::Turn(Turn {
                turn_id: turn.id,
                state: TurnState::Completed,
                duration_ms,
                usage: None,
            }),
        });
        self.done.push(turn.rows);
    }

    /// Every turn, the newest that fit in `MAX_ROWS`.
    fn finish(mut self) -> Vec<JournalRow> {
        self.close(None);
        let mut kept = Vec::new();
        let mut total = 0;
        for turn in self.done.into_iter().rev() {
            if total + turn.len() > MAX_ROWS && total > 0 {
                break;
            }
            total += turn.len();
            kept.push(turn);
        }
        kept.into_iter().rev().flatten().collect()
    }
}

fn message(role: Role, text: String) -> JournalBody {
    JournalBody::Message(Message {
        role,
        text,
        streaming: false,
        parent_call_id: None,
        attachments: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A conversation begun in the terminal and carried on in a chat run.
    const MIXED: &str = r#"{"type":"user","entrypoint":"cli","uuid":"u1","timestamp":"2026-11-06T09:00:00.000Z","message":{"role":"user","content":"fix the date parsing"}}
{"type":"assistant","entrypoint":"cli","uuid":"a1","timestamp":"2026-11-06T09:00:05.000Z","message":{"content":[{"type":"text","text":"Looking."},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}]}}
{"type":"user","entrypoint":"cli","uuid":"r1","timestamp":"2026-11-06T09:00:06.000Z","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"a.rs"}]}}
{"type":"assistant","entrypoint":"cli","uuid":"a2","timestamp":"2026-11-06T09:00:09.000Z","message":{"content":[{"type":"text","text":"Fixed."}]}}
{"type":"system","entrypoint":"cli","subtype":"turn_duration","uuid":"d1","timestamp":"2026-11-06T09:00:10.000Z","durationMs":10000}
{"type":"user","entrypoint":"sdk-cli","uuid":"u2","timestamp":"2026-11-09T12:00:00.000Z","message":{"role":"user","content":"and from the chat"}}
{"type":"assistant","entrypoint":"sdk-cli","uuid":"a3","timestamp":"2026-11-09T12:00:03.000Z","message":{"content":[{"type":"text","text":"Already in the journal."}]}}
"#;

    fn write(text: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("trace-history-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("c.jsonl");
        std::fs::write(&path, text).unwrap();
        path
    }

    #[test]
    fn terminal_turns_become_rows_and_chat_run_turns_are_left_out() {
        let path = write(MIXED);
        let rows = rows(&path);
        let ids: Vec<&str> = rows.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "hist:user:u1",
                "hist:reply:a1:0",
                "hist:tool:toolu_1",
                "hist:reply:a2:0",
                "turn:hist-u1",
            ]
        );
        assert!(rows.iter().all(|r| r.turn_id.as_deref() == Some("hist-u1")));
        let JournalBody::Tool(call) = &rows[2].body else {
            panic!("a tool row")
        };
        assert_eq!(call.output.as_deref(), Some("a.rs"));
        assert_eq!(call.state, ToolState::Completed);
        let JournalBody::Turn(turn) = &rows[4].body else {
            panic!("a turn row")
        };
        assert_eq!(turn.state, TurnState::Completed);
        assert_eq!(turn.duration_ms, Some(10_000));
        assert_eq!(rows[0].at, 1_793_955_600_000);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_turn_left_open_is_closed_and_a_missing_file_has_no_rows() {
        let path = write(
            r#"{"type":"user","entrypoint":"cli","uuid":"u1","timestamp":"2026-11-06T09:00:00Z","message":{"role":"user","content":"hello"}}
"#,
        );
        let rows = rows(&path);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].id, "turn:hist-u1");
        assert!(super::rows(&path.with_file_name("gone.jsonl")).is_empty());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn only_the_newest_whole_turns_are_kept() {
        let mut builder = Builder::default();
        for i in 0..(MAX_ROWS / 2 + 10) {
            builder.item(
                TranscriptItem::Prompt {
                    id: format!("u{i}"),
                    text: "hi".into(),
                    at: None,
                },
                i as u64,
            );
        }
        let rows = builder.finish();
        assert!(rows.len() <= MAX_ROWS);
        assert_eq!(rows.len() % 2, 0, "each turn is a prompt and its turn row");
        assert_eq!(
            rows.last().unwrap().id,
            format!("turn:hist-u{}", MAX_ROWS / 2 + 9)
        );
    }
}
