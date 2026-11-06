//! One JSONL line of a Claude Code conversation → the items it shows as.
//!
//! The format is Claude Code's own and grows new entry kinds often (`attachment`,
//! `queue-operation`, `api-request`, …), so this is an allow-list: only the shapes
//! below produce items, anything else — including malformed lines — is skipped.

use serde::Deserialize;
use serde_json::Value;

use super::{clip, TranscriptItem, MAX_RESULT, MAX_TEXT};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    uuid: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    /// Harness-injected context nobody typed (reminders, command caveats).
    #[serde(default)]
    is_meta: bool,
    /// A subagent's side conversation, not the main thread.
    #[serde(default)]
    is_sidechain: bool,
    /// The summary that replaces history after compaction — the boundary
    /// entry already says it happened.
    #[serde(default)]
    is_compact_summary: bool,
    #[serde(default)]
    subtype: Option<String>,
    #[serde(default)]
    duration_ms: Option<u64>,
    #[serde(default)]
    message: Option<Message>,
}

#[derive(Deserialize)]
struct Message {
    #[serde(default)]
    content: Option<Value>,
}

/// Parse one line. Never fails: a line that isn't a shape we show yields nothing.
pub(super) fn line(raw: &str) -> Vec<TranscriptItem> {
    let Ok(entry) = serde_json::from_str::<Entry>(raw) else {
        return Vec::new();
    };
    if entry.is_meta || entry.is_sidechain || entry.is_compact_summary {
        return Vec::new();
    }
    let id = entry.uuid.clone().unwrap_or_default();
    match entry.kind.as_str() {
        "system" => system(&entry, id).into_iter().collect(),
        "user" | "assistant" => {
            let content = entry.message.and_then(|m| m.content);
            match (entry.kind.as_str(), content) {
                ("user", Some(Value::String(text))) => user_text(&text, id, entry.timestamp),
                ("user", Some(Value::Array(blocks))) => blocks
                    .iter()
                    .enumerate()
                    .flat_map(|(i, b)| user_block(b, &id, i))
                    .collect(),
                ("assistant", Some(Value::Array(blocks))) => blocks
                    .iter()
                    .enumerate()
                    .filter_map(|(i, b)| assistant_block(b, &id, i, &entry.timestamp))
                    .collect(),
                _ => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

fn system(entry: &Entry, id: String) -> Option<TranscriptItem> {
    match entry.subtype.as_deref()? {
        "turn_duration" => Some(TranscriptItem::TurnEnd {
            id,
            duration_ms: entry.duration_ms?,
        }),
        "compact_boundary" => Some(TranscriptItem::Notice {
            id,
            text: "Conversation compacted".to_string(),
        }),
        _ => None,
    }
}

/// A typed prompt, or one of the harness's own records that arrive as user text.
fn user_text(text: &str, id: String, at: Option<String>) -> Vec<TranscriptItem> {
    let trimmed = text.trim();
    if trimmed.is_empty()
        || trimmed.starts_with("<system-reminder")
        || trimmed.starts_with("<local-command-caveat")
        || trimmed.starts_with("Caveat:")
    {
        return Vec::new();
    }
    if let Some(name) = tag(trimmed, "command-name") {
        let args = tag(trimmed, "command-args").unwrap_or_default();
        let text = format!("{name} {args}").trim().to_string();
        return vec![TranscriptItem::Command { id, text }];
    }
    if let Some(cmd) = tag(trimmed, "bash-input") {
        return vec![TranscriptItem::Command {
            id,
            text: format!("! {cmd}"),
        }];
    }
    for output in [
        "local-command-stdout",
        "bash-stdout",
        "local-command-stderr",
    ] {
        if let Some(out) = tag(trimmed, output) {
            let out = strip_ansi(&out);
            return notice(id, out.trim());
        }
    }
    if trimmed.starts_with("<bash-stderr") {
        return Vec::new();
    }
    if trimmed.starts_with("<task-notification") {
        let summary = tag(trimmed, "summary");
        let text = summary.unwrap_or_else(|| "A background task reported back.".to_string());
        return notice(id, &text);
    }
    if trimmed.starts_with("[Request interrupted") {
        return notice(id, "Interrupted by you");
    }
    vec![TranscriptItem::Prompt {
        id,
        text: clip(trimmed, MAX_TEXT),
        at,
    }]
}

fn notice(id: String, text: &str) -> Vec<TranscriptItem> {
    if text.is_empty() {
        return Vec::new();
    }
    vec![TranscriptItem::Notice {
        id,
        text: clip(text, MAX_RESULT),
    }]
}

fn user_block(block: &Value, entry_id: &str, index: usize) -> Vec<TranscriptItem> {
    let id = format!("{entry_id}:{index}");
    match block.get("type").and_then(Value::as_str) {
        Some("tool_result") => {
            let Some(tool_use_id) = block.get("tool_use_id").and_then(Value::as_str) else {
                return Vec::new();
            };
            vec![TranscriptItem::ToolResult {
                id,
                tool_use_id: tool_use_id.to_string(),
                text: clip(result_text(block.get("content")).trim(), MAX_RESULT),
                is_error: block
                    .get("is_error")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            }]
        }
        Some("text") => {
            let text = block
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default();
            user_text(text, id, None)
        }
        _ => Vec::new(),
    }
}

/// A tool result's content: a bare string, or text/image blocks.
fn result_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|b| match b.get("type").and_then(Value::as_str) {
                Some("text") => b.get("text").and_then(Value::as_str).map(str::to_string),
                Some("image") => Some("[image]".to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn assistant_block(
    block: &Value,
    entry_id: &str,
    index: usize,
    at: &Option<String>,
) -> Option<TranscriptItem> {
    let id = format!("{entry_id}:{index}");
    match block.get("type").and_then(Value::as_str)? {
        "text" => {
            let text = block.get("text").and_then(Value::as_str)?.trim();
            (!text.is_empty()).then(|| TranscriptItem::Reply {
                id,
                text: clip(text, MAX_TEXT),
                at: at.clone(),
            })
        }
        "tool_use" => Some(TranscriptItem::ToolCall {
            id,
            tool_use_id: block.get("id").and_then(Value::as_str)?.to_string(),
            name: block.get("name").and_then(Value::as_str)?.to_string(),
            input: clip_value(block.get("input").cloned().unwrap_or(Value::Null), 0),
            at: at.clone(),
        }),
        // Thinking is Claude's scratchpad (and often redacted); not the answer.
        _ => None,
    }
}

/// Clip every string in a tool's input, and stop descending past a few levels,
/// so one `Write` of a huge file can't bloat every poll.
fn clip_value(value: Value, depth: usize) -> Value {
    match value {
        Value::String(s) => Value::String(clip(&s, MAX_TEXT)),
        Value::Array(items) if depth < 4 => Value::Array(
            items
                .into_iter()
                .take(100)
                .map(|v| clip_value(v, depth + 1))
                .collect(),
        ),
        Value::Object(map) if depth < 4 => Value::Object(
            map.into_iter()
                .map(|(k, v)| (k, clip_value(v, depth + 1)))
                .collect(),
        ),
        Value::Array(_) | Value::Object(_) => Value::Null,
        other => other,
    }
}

/// The text inside `<name>…</name>`, if the tag is present.
fn tag(text: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&close).map_or(text.len(), |e| start + e);
    Some(text[start..end].trim().to_string())
}

/// Drop ANSI CSI/OSC sequences: local command output is captured with colour.
fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                // Parameters and intermediates, then one final byte in @..~.
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' || (c == '\u{1b}' && chars.next_if_eq(&'\\').is_some()) {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}
