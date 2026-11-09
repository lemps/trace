//! Getting a Claude chat agent's output to where it goes: rows to the journal
//! (streaming revisions paced), replies to the agent's stdin, and why it ended.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, Instant};

use super::translate::Out;
use crate::agent_session::process::{ChatProcess, Exit};
use crate::agent_session::JournalSink;

/// Least time between two streaming revisions of one row sent on. Every delta
/// re-sends the whole text so far, so passing each one costs the square of the
/// answer's length; the final revision always goes.
const STREAM_EVERY: Duration = Duration::from_millis(50);

/// When each streaming row last went out.
#[derive(Default)]
pub(crate) struct Pacer(HashMap<String, Instant>);

impl Pacer {
    /// Whether this revision goes out now.
    pub(crate) fn passes(&mut self, row: &crate::agent_session::journal::JournalRow) -> bool {
        use crate::agent_session::journal::JournalBody;
        let streaming = matches!(&row.body, JournalBody::Message(m) if m.streaming);
        if !streaming {
            self.0.remove(&row.id);
            return true;
        }
        let now = Instant::now();
        match self.0.get(&row.id) {
            Some(last) if now.duration_since(*last) < STREAM_EVERY => false,
            _ => {
                self.0.insert(row.id.clone(), now);
                true
            }
        }
    }
}

pub(super) fn deliver(
    out: Out,
    sink: &dyn JournalSink,
    process: &mut dyn ChatProcess,
    paced: &mut Pacer,
) {
    match out {
        Out::Row(row) => {
            if paced.passes(&row) {
                sink.row(row);
            }
        }
        Out::Info(info) => sink.info(info),
        // A failed write means Claude is gone; its EOF says so.
        Out::Reply(value) => {
            process.write_line(&value.to_string());
        }
        // `run` serves these when the agent has tools; otherwise say so.
        Out::Mcp { request_id, .. } => {
            let refused = serde_json::json!({
                "type": "control_response",
                "response": { "subtype": "error", "request_id": request_id,
                              "error": "trace serves no tools to this agent." },
            });
            process.write_line(&refused.to_string());
        }
    }
}

/// Why Claude ended when nobody asked it to: its exit status and last words.
pub(super) fn exit_reason(status: Exit, tail: &VecDeque<String>) -> String {
    let how = match status {
        Exit::Code(0) | Exit::Unknown => "Claude exited.".to_string(),
        Exit::Code(code) => format!("Claude exited (code {code})."),
    };
    match tail.back() {
        Some(last) => format!("{how} {}", crate::agent_session::journal::cap(last)),
        None => how,
    }
}
