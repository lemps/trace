//! Claude's stream-json output, line by line, as journal rows. Pure: no process,
//! no IO, so the fixture test drives it with recorded lines. What the adapter must
//! write back to Claude comes out as `Out::Reply`.
//!
//! - `stream_event` partial text and thinking → streaming message rows, keyed by
//!   the API message id and block index; the final `assistant` line's copy of the
//!   same text is then skipped.
//! - `assistant` `tool_use` → a tool row (TodoWrite → a plan row instead), which
//!   the matching `user` `tool_result` completes or fails; a successful Edit,
//!   MultiEdit or Write adds a diff row.
//! - `control_request` `can_use_tool` → an approval or question row (`prompts`).
//! - `result` → the turn row, with usage and cost; `system`/`rate_limit_event` →
//!   `SessionInfo`. See `turn` for the turn's lifecycle.

mod session;
mod turn;

use std::collections::{HashMap, HashSet};

use serde_json::{json, Value};

use super::book::RowBook;
use super::prompts::{self, str_at, Pending};
use super::tools;
use crate::agent_session::journal::{
    JournalBody, JournalRow, Message, Role, Status, Tone, ToolCall, ToolState,
};
use crate::agent_session::SessionInfo;

/// What a line (or a user action) produced.
#[derive(Debug, PartialEq)]
pub enum Out {
    Row(JournalRow),
    Info(SessionInfo),
    /// A line to write to Claude's stdin.
    Reply(Value),
}

pub struct Translator {
    book: RowBook,
    info: SessionInfo,
    turn: Option<OpenTurn>,
    /// Text and thinking blocks still streaming, by (API message id, index).
    blocks: HashMap<(String, u64), Block>,
    /// API messages whose text came as stream events this turn.
    streamed: HashSet<String>,
    /// Tool calls awaiting their result, by call id: (name, input).
    tools: HashMap<String, (String, Value)>,
    /// Prompts awaiting the user, by request id.
    pending: HashMap<String, Pending>,
    /// `total_cost_usd` so far: it's cumulative, a turn's cost is the difference.
    cost_so_far: f64,
}

struct OpenTurn {
    id: String,
    interrupting: bool,
}

struct Block {
    row_id: String,
    role: Role,
    text: String,
}

impl Translator {
    pub fn new(next_seq: u64, clock: fn() -> u64) -> Self {
        Self {
            book: RowBook::new(next_seq, clock),
            info: SessionInfo {
                agent: "claude".to_string(),
                ..SessionInfo::default()
            },
            turn: None,
            blocks: HashMap::new(),
            streamed: HashSet::new(),
            tools: HashMap::new(),
            pending: HashMap::new(),
            cost_so_far: 0.0,
        }
    }

    /// One line of Claude's stdout. Lines that aren't JSON are ignored.
    pub fn line(&mut self, line: &str) -> Vec<Out> {
        let mut out = Vec::new();
        let Ok(m) = serde_json::from_str::<Value>(line) else {
            return out;
        };
        match str_at(&m, "type") {
            Some("stream_event") => self.stream_event(&m, &mut out),
            Some("assistant") => self.assistant(&m, &mut out),
            Some("user") => self.tool_results(&m, &mut out),
            Some("control_request") => self.control_request(&m, &mut out),
            Some("control_cancel_request") => {
                if let Some(id) = str_at(&m, "request_id") {
                    self.cancel_prompt(id, &mut out);
                }
            }
            Some("control_response") => {
                let r = &m["response"];
                if str_at(r, "subtype") == Some("error") {
                    let text = str_at(r, "error").unwrap_or("Claude refused a request.");
                    self.status(text, Tone::Warning, &mut out);
                }
            }
            Some("result") => self.result(&m, &mut out),
            Some("system") => self.system(&m, &mut out),
            Some("rate_limit_event") => self.rate_limits(&m["rate_limit_info"], &mut out),
            _ => {}
        }
        out
    }

    fn stream_event(&mut self, m: &Value, out: &mut Vec<Out>) {
        // A subagent's text is its own business; its tool calls still show.
        if !m["parent_tool_use_id"].is_null() {
            return;
        }
        let e = &m["event"];
        let mid = str_at(m, "api_message_id")
            .or_else(|| str_at(&e["message"], "id"))
            .unwrap_or_default()
            .to_string();
        let index = e["index"].as_u64().unwrap_or(0);
        match str_at(e, "type") {
            Some("message_start") => {
                self.streamed.insert(mid);
            }
            Some("content_block_start") => {
                let role = match str_at(&e["content_block"], "type") {
                    Some("text") => Role::Assistant,
                    Some("thinking") => Role::Reasoning,
                    _ => return,
                };
                let row_id = format!("msg:{mid}:{index}");
                let text = String::new();
                self.blocks
                    .insert((mid, index), Block { row_id, role, text });
            }
            Some("content_block_delta") => {
                let d = &e["delta"];
                let piece = str_at(d, "text").or_else(|| str_at(d, "thinking"));
                let Some(piece) = piece.filter(|p| !p.is_empty()) else {
                    return;
                };
                let turn = self.turn_id(out);
                if let Some(block) = self.blocks.get_mut(&(mid, index)) {
                    block.text.push_str(piece);
                    let body = message(block.role, &block.text, true);
                    out.push(Out::Row(self.book.put(&block.row_id, Some(&turn), body)));
                }
            }
            Some("content_block_stop") => {
                let Some(block) = self.blocks.remove(&(mid, index)) else {
                    return;
                };
                if self.book.get(&block.row_id).is_some() {
                    let body = message(block.role, &block.text, false);
                    out.push(Out::Row(self.book.put(&block.row_id, None, body)));
                    self.book.retire(&block.row_id);
                }
            }
            _ => {}
        }
    }

    fn assistant(&mut self, m: &Value, out: &mut Vec<Out>) {
        let msg = &m["message"];
        let mid = str_at(msg, "id").unwrap_or_default();
        let parent = str_at(m, "parent_tool_use_id").map(str::to_string);
        let uuid = str_at(m, "uuid").unwrap_or(mid).to_string();
        let streamed = self.streamed.contains(mid);
        let blocks = msg["content"].as_array().cloned().unwrap_or_default();
        for (i, block) in blocks.iter().enumerate() {
            let turn = self.turn_id(out);
            match str_at(block, "type") {
                Some(kind @ ("text" | "thinking")) if !streamed && parent.is_none() => {
                    let text = str_at(block, kind).unwrap_or_default();
                    if text.is_empty() {
                        continue;
                    }
                    let role = if kind == "text" {
                        Role::Assistant
                    } else {
                        Role::Reasoning
                    };
                    let id = format!("msg:{uuid}:{i}");
                    out.push(Out::Row(self.book.put(
                        &id,
                        Some(&turn),
                        message(role, text, false),
                    )));
                    self.book.retire(&id);
                }
                Some("tool_use") => {
                    let call_id = str_at(block, "id").unwrap_or_default().to_string();
                    let name = str_at(block, "name").unwrap_or_default().to_string();
                    let input = block.get("input").cloned().unwrap_or(Value::Null);
                    if name == "TodoWrite" {
                        if let Some(plan) = tools::plan(&input) {
                            let id = format!("plan:{turn}");
                            let body = JournalBody::Plan(plan);
                            out.push(Out::Row(self.book.put(&id, Some(&turn), body)));
                        }
                    } else if !tools::is_quiet(&name) {
                        let body = JournalBody::Tool(ToolCall {
                            call_id: call_id.clone(),
                            name: name.clone(),
                            input: input.clone(),
                            state: ToolState::Running,
                            output: None,
                            parent_call_id: parent.clone(),
                        });
                        let id = format!("tool:{call_id}");
                        out.push(Out::Row(self.book.put(&id, Some(&turn), body)));
                    }
                    self.tools.insert(call_id, (name, input));
                }
                _ => {}
            }
        }
    }

    fn tool_results(&mut self, m: &Value, out: &mut Vec<Out>) {
        let blocks = m["message"]["content"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let results: Vec<&Value> = blocks
            .iter()
            .filter(|b| str_at(b, "type") == Some("tool_result"))
            .collect();
        // `tool_use_result` describes the line's one result; with several it's unclear.
        let detail = (results.len() == 1)
            .then(|| m.get("tool_use_result"))
            .flatten();
        for block in results {
            let call_id = str_at(block, "tool_use_id").unwrap_or_default();
            let Some((name, input)) = self.tools.remove(call_id) else {
                continue;
            };
            if tools::is_quiet(&name) {
                continue;
            }
            let failed = block["is_error"].as_bool().unwrap_or(false);
            let output = tools::result_text(block.get("content"));
            let id = format!("tool:{call_id}");
            let row = self.book.update(&id, |body| {
                if let JournalBody::Tool(t) = body {
                    t.state = if failed {
                        ToolState::Failed
                    } else {
                        ToolState::Completed
                    };
                    t.output = Some(output);
                }
            });
            let turn = row.as_ref().and_then(|r| r.turn_id.clone());
            out.extend(row.map(Out::Row));
            self.book.retire(&id);
            if failed {
                continue;
            }
            if let Some(diff) = tools::diff(call_id, &name, &input, detail) {
                let id = format!("diff:{call_id}");
                let row = self.book.put(&id, turn.as_deref(), JournalBody::Diff(diff));
                out.push(Out::Row(row));
                self.book.retire(&id);
            }
        }
    }

    fn control_request(&mut self, m: &Value, out: &mut Vec<Out>) {
        let request_id = str_at(m, "request_id").unwrap_or_default().to_string();
        let req = &m["request"];
        if str_at(req, "subtype") != Some("can_use_tool") {
            // Hooks and SDK MCP servers would come this way; trace registers none.
            out.push(Out::Reply(json!({
                "type": "control_response",
                "response": {"subtype": "error", "request_id": request_id,
                             "error": "Not supported by trace."},
            })));
            return;
        }
        let turn = self.turn_id(out);
        let (body, pending) = if str_at(req, "tool_name") == Some("AskUserQuestion") {
            let (set, pending) = prompts::questions(&request_id, req);
            (JournalBody::Question(set), pending)
        } else {
            let (approval, pending) = prompts::approval(&request_id, req);
            (JournalBody::Approval(approval), pending)
        };
        out.push(Out::Row(self.book.put(&pending.row_id, Some(&turn), body)));
        self.pending.insert(request_id, pending);
    }

    /// A status row of trace's own (a prompt that couldn't be answered).
    pub fn notice(&mut self, text: &str, tone: Tone) -> Vec<Out> {
        let mut out = Vec::new();
        self.status(text, tone, &mut out);
        out
    }

    fn status(&mut self, text: &str, tone: Tone, out: &mut Vec<Out>) {
        let id = format!("status:{}", self.book.next_seq());
        let turn = self.turn.as_ref().map(|t| t.id.clone());
        let body = JournalBody::Status(Status {
            text: text.to_string(),
            tone,
        });
        out.push(Out::Row(self.book.put(&id, turn.as_deref(), body)));
        self.book.retire(&id);
    }
}

fn message(role: Role, text: &str, streaming: bool) -> JournalBody {
    JournalBody::Message(Message {
        role,
        text: text.to_string(),
        streaming,
    })
}
