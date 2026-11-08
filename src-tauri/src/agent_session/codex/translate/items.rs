//! Codex's thread items as rows. `item/started` opens a tool row, the deltas
//! stream text into a message row, and `item/completed` gives each its final
//! form: an agent message or reasoning settles, a command or tool call ends
//! with its output, and an applied file change adds a diff row per file.

use serde_json::{json, Value};

use super::{str_at, Out, Stream, Translator};
use crate::agent_session::journal::{
    cap, ChangeKind, FileDiff, JournalBody, Role, Subagent, Tone, ToolCall, ToolState,
};

/// Command output kept from deltas, for a command that ends without its own copy.
const OUTPUT_KEEP: usize = 2 * crate::agent_session::journal::CAP_CHARS;

impl Translator {
    pub(super) fn item_started(&mut self, item: &Value, out: &mut Vec<Out>) {
        let id = str_at(item, "id").unwrap_or_default().to_string();
        if str_at(item, "type") == Some("fileChange") {
            // Its approval request names only the item: the patch comes from here.
            self.started.insert(id.clone(), item.clone());
        }
        if let Some(tool) = tool_of(item) {
            let subagent = self.collab_subagent(&id, item, out);
            self.tool_row(&id, tool, ToolState::Running, None, subagent, out);
        }
    }

    pub(super) fn item_completed(&mut self, item: &Value, out: &mut Vec<Out>) {
        let id = str_at(item, "id").unwrap_or_default().to_string();
        match str_at(item, "type") {
            Some("agentMessage") => {
                let text = str_at(item, "text").unwrap_or_default();
                self.settle_text(&id, Role::Assistant, text, out);
            }
            Some("plan") => {
                let text = str_at(item, "text").unwrap_or_default();
                self.settle_text(&id, Role::Assistant, text, out);
            }
            Some("reasoning") => {
                let joined = |key: &str| -> String {
                    let parts = item[key].as_array().cloned().unwrap_or_default();
                    let parts: Vec<&str> = parts.iter().filter_map(Value::as_str).collect();
                    parts.join("\n\n")
                };
                let summary = joined("summary");
                let text = if summary.is_empty() {
                    joined("content")
                } else {
                    summary
                };
                self.settle_text(&id, Role::Reasoning, &text, out);
            }
            Some("contextCompaction") => self.status("Conversation compacted.", Tone::Info, out),
            _ => {
                if let Some(tool) = tool_of(item) {
                    let (state, output) = self.tool_result(&id, item);
                    let subagent = self.collab_subagent(&id, item, out);
                    self.tool_row(&id, tool, state, output, subagent, out);
                    if state == ToolState::Completed {
                        self.diffs(&id, item, out);
                    }
                    if str_at(item, "type") == Some("collabAgentToolCall") {
                        self.collab_done(&id, item, out);
                    }
                }
            }
        }
    }

    /// A text delta for the message or reasoning item `itemId`. `part` is the
    /// reasoning summary part: a new one starts a paragraph.
    pub(super) fn delta(&mut self, p: &Value, role: Role, part: Option<u64>, out: &mut Vec<Out>) {
        let Some(piece) = str_at(p, "delta").filter(|d| !d.is_empty()) else {
            return;
        };
        let item = str_at(p, "itemId").unwrap_or_default().to_string();
        let turn = self.row_turn(out);
        let parent = self.parent.clone();
        let s = self.streams.entry(item.clone()).or_insert_with(|| Stream {
            row_id: row_id(role, &item),
            role,
            text: String::new(),
            part,
            parent,
        });
        if part.is_some() && s.part != part {
            if !s.text.is_empty() {
                s.text.push_str("\n\n");
            }
            s.part = part;
        }
        s.text.push_str(piece);
        let body = JournalBody::Message(crate::agent_session::journal::Message {
            role: s.role,
            text: s.text.clone(),
            streaming: true,
            parent_call_id: s.parent.clone(),
            attachments: Vec::new(),
        });
        let row_id = s.row_id.clone();
        out.push(Out::Row(self.book.put(&row_id, Some(&turn), body)));
    }

    /// Command output as it runs, kept for a command that ends without its own copy.
    pub(super) fn output_delta(&mut self, p: &Value) {
        let (Some(item), Some(piece)) = (str_at(p, "itemId"), str_at(p, "delta")) else {
            return;
        };
        let entry = self.started.entry(item.to_string()).or_insert(json!({}));
        let kept = entry["output"].as_str().unwrap_or_default();
        if kept.len() < OUTPUT_KEEP {
            entry["output"] = json!(format!("{kept}{piece}"));
        }
    }

    /// The final text of a message or reasoning item, streamed or not.
    fn settle_text(&mut self, id: &str, role: Role, text: &str, out: &mut Vec<Out>) {
        let mut s = self.streams.remove(id).unwrap_or_else(|| Stream {
            row_id: row_id(role, id),
            role,
            text: String::new(),
            part: None,
            parent: self.parent.clone(),
        });
        if !text.is_empty() {
            s.text = text.to_string();
        }
        if s.text.is_empty() {
            return;
        }
        if role == Role::Assistant {
            self.note_child_text(&s.text);
        }
        let turn = self.row_turn(out);
        let row = self
            .book
            .put(&s.row_id, Some(&turn), super::turn::message(&s));
        out.push(Out::Row(row));
        self.book.retire(&s.row_id);
    }

    fn tool_row(
        &mut self,
        id: &str,
        (name, input): (String, Value),
        state: ToolState,
        output: Option<String>,
        subagent: Option<Subagent>,
        out: &mut Vec<Out>,
    ) {
        let turn = self.row_turn(out);
        let body = JournalBody::Tool(ToolCall {
            call_id: id.to_string(),
            name,
            input,
            state,
            output,
            parent_call_id: self.parent.clone(),
            subagent: subagent.map(Box::new),
        });
        out.push(Out::Row(self.book.put(
            &format!("tool:{id}"),
            Some(&turn),
            body,
        )));
    }

    /// How a finished tool item went, and what it printed.
    fn tool_result(&mut self, id: &str, item: &Value) -> (ToolState, Option<String>) {
        let ok = match item["status"].as_str() {
            Some("completed") => true,
            Some(_) => false,
            None => item["success"].as_bool().unwrap_or(true),
        };
        let state = if ok {
            ToolState::Completed
        } else {
            ToolState::Failed
        };
        let streamed = self.started.remove(id);
        let text = match str_at(item, "type") {
            Some("commandExecution") => str_at(item, "aggregatedOutput")
                .map(str::to_string)
                .or_else(|| streamed.and_then(|s| s["output"].as_str().map(str::to_string))),
            Some("mcpToolCall") => match str_at(&item["error"], "message") {
                Some(e) => Some(e.to_string()),
                None => Some(content_text(&item["result"]["content"])),
            },
            Some("dynamicToolCall") => Some(content_text(&item["contentItems"])),
            Some("fileChange") => match item["status"].as_str() {
                Some("declined") => Some("The user declined this.".to_string()),
                Some("failed") => Some("The patch didn't apply.".to_string()),
                _ => None,
            },
            _ => None,
        };
        let text = text.filter(|t| !t.is_empty()).map(|t| cap(&t));
        (state, text)
    }

    /// A diff row per file an applied change touched.
    fn diffs(&mut self, id: &str, item: &Value, out: &mut Vec<Out>) {
        let Some(changes) = item["changes"].as_array() else {
            return;
        };
        let turn = self.row_turn(out);
        for (i, c) in changes.iter().enumerate() {
            let text = str_at(c, "diff").map(cap);
            let kind = &c["kind"];
            let path = str_at(kind, "move_path")
                .or_else(|| str_at(c, "path"))
                .unwrap_or_default()
                .to_string();
            let (change, before, after, patch) = match str_at(kind, "type") {
                Some("add") => (ChangeKind::Add, None, text, None),
                Some("delete") => (ChangeKind::Delete, text, None, None),
                _ => (ChangeKind::Edit, None, None, text),
            };
            let body = JournalBody::Diff(FileDiff {
                call_id: Some(id.to_string()),
                path,
                change,
                before,
                after,
                patch,
            });
            let row_id = format!("diff:{id}:{i}");
            out.push(Out::Row(self.book.put(&row_id, Some(&turn), body)));
            self.book.retire(&row_id);
        }
    }
}

fn row_id(role: Role, item: &str) -> String {
    match role {
        Role::Reasoning => format!("reasoning:{item}"),
        _ => format!("msg:{item}"),
    }
}

/// The tool row an item is, by the names the chat view knows: `shell`,
/// `apply_patch`, `web_search`, `view_image`, `mcp__<server>__<tool>`.
fn tool_of(item: &Value) -> Option<(String, Value)> {
    let tool = |name: &str, input: Value| Some((name.to_string(), input));
    match str_at(item, "type")? {
        "commandExecution" => tool("shell", command_input(item)),
        "fileChange" => tool(
            "apply_patch",
            json!({"input": patch_text(&item["changes"])}),
        ),
        "mcpToolCall" => {
            let name = format!(
                "mcp__{}__{}",
                str_at(item, "server").unwrap_or("mcp"),
                str_at(item, "tool").unwrap_or("tool")
            );
            Some((
                name,
                crate::agent_session::claude::tools::cap_input(&item["arguments"]),
            ))
        }
        "dynamicToolCall" => {
            let name = str_at(item, "tool").unwrap_or("tool");
            tool(
                name,
                crate::agent_session::claude::tools::cap_input(&item["arguments"]),
            )
        }
        "webSearch" => tool("web_search", json!({"query": str_at(item, "query")})),
        "imageView" => tool("view_image", json!({"path": str_at(item, "path")})),
        "collabAgentToolCall" => Some(super::agents::collab_tool(item)),
        _ => None,
    }
}

/// A command as the user would type it. Codex reports the shell invocation
/// (`powershell.exe -Command '…'`) and, parsed, what it runs: one action is
/// shown as that action's command.
fn command_input(item: &Value) -> Value {
    let raw = str_at(item, "command").unwrap_or_default();
    let actions = item["commandActions"].as_array();
    let shown = match actions.map(Vec::as_slice) {
        Some([only]) => str_at(only, "command").unwrap_or(raw),
        _ => raw,
    };
    json!({"command": cap(shown), "cwd": str_at(item, "cwd")})
}

/// Codex's changes in apply_patch's own form, so the view names the files.
pub(in crate::agent_session::codex) fn patch_text(changes: &Value) -> String {
    let mut text = String::from("*** Begin Patch\n");
    for c in changes.as_array().map(Vec::as_slice).unwrap_or_default() {
        let verb = match str_at(&c["kind"], "type") {
            Some("add") => "Add",
            Some("delete") => "Delete",
            _ => "Update",
        };
        let path = str_at(c, "path").unwrap_or_default();
        text.push_str(&format!("*** {verb} File: {path}\n"));
        if let Some(to) = str_at(&c["kind"], "move_path") {
            text.push_str(&format!("*** Move to: {to}\n"));
        }
        text.push_str(str_at(c, "diff").unwrap_or_default());
        if !text.ends_with('\n') {
            text.push('\n');
        }
    }
    text.push_str("*** End Patch");
    cap(&text)
}

/// The text of MCP-style content items; other kinds are named.
fn content_text(content: &Value) -> String {
    let items = content.as_array().map(Vec::as_slice).unwrap_or_default();
    let parts: Vec<String> = items
        .iter()
        .map(|c| match str_at(c, "text") {
            Some(t) => t.to_string(),
            None => format!("[{}]", str_at(c, "type").unwrap_or("content")),
        })
        .collect();
    parts.join("\n")
}
