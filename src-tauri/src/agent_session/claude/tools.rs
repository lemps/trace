//! What Claude's own tools mean beyond a tool row: file edits become diffs,
//! TodoWrite becomes a plan, and a tool result's content becomes capped text.

use serde_json::Value;

use super::prompts::str_at;
use crate::agent_session::journal::{cap, ChangeKind, FileDiff, Plan, PlanItem, PlanStatus};

/// Tools shown as their own row kind (a plan, a question card) rather than as a
/// tool call too.
pub fn is_quiet(name: &str) -> bool {
    matches!(name, "TodoWrite" | "AskUserQuestion")
}

/// TodoWrite's list as a plan.
pub fn plan(input: &Value) -> Option<Plan> {
    let todos = input.get("todos")?.as_array()?;
    let items = todos
        .iter()
        .map(|t| PlanItem {
            text: str_at(t, "content").unwrap_or_default().to_string(),
            status: match str_at(t, "status") {
                Some("in_progress") => PlanStatus::InProgress,
                Some("completed") => PlanStatus::Done,
                _ => PlanStatus::Pending,
            },
        })
        .collect();
    Some(Plan { items })
}

/// The file change a successful Edit, MultiEdit or Write made. `result` is the
/// line's `tool_use_result`, which knows whether Write created or replaced.
pub fn diff(call_id: &str, name: &str, input: &Value, result: Option<&Value>) -> Option<FileDiff> {
    let path = str_at(input, "file_path")?.to_string();
    let patch = result
        .and_then(|r| r.get("structuredPatch"))
        .and_then(patch_text);
    let capped = |key: &str| str_at(input, key).map(cap);
    let (kind, before, after) = match name {
        "Write" => {
            let original = result.and_then(|r| str_at(r, "originalFile"));
            let replaced = result.and_then(|r| str_at(r, "type")) == Some("update");
            let kind = if replaced || original.is_some() {
                ChangeKind::Edit
            } else {
                ChangeKind::Add
            };
            (kind, original.map(cap), capped("content"))
        }
        "Edit" => (ChangeKind::Edit, capped("old_string"), capped("new_string")),
        "MultiEdit" => {
            let edits = input.get("edits")?.as_array()?;
            let join = |key: &str| {
                let parts: Vec<&str> = edits.iter().filter_map(|e| str_at(e, key)).collect();
                cap(&parts.join("\n…\n"))
            };
            (
                ChangeKind::Edit,
                Some(join("old_string")),
                Some(join("new_string")),
            )
        }
        _ => return None,
    };
    Some(FileDiff {
        call_id: Some(call_id.to_string()),
        path,
        kind,
        before,
        after,
        patch,
    })
}

/// Claude's `structuredPatch` hunks as unified diff text. `None` when empty (a
/// new file reports no hunks).
fn patch_text(hunks: &Value) -> Option<String> {
    let hunks = hunks.as_array().filter(|h| !h.is_empty())?;
    let mut out = String::new();
    for h in hunks {
        let n = |k: &str| h.get(k).and_then(Value::as_u64).unwrap_or(0);
        out.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            n("oldStart"),
            n("oldLines"),
            n("newStart"),
            n("newLines")
        ));
        for line in h
            .get("lines")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            out.push_str(line.as_str().unwrap_or_default());
            out.push('\n');
        }
    }
    Some(cap(&out))
}

/// A tool result's content as text: a string, or the text of its blocks.
pub fn result_text(content: Option<&Value>) -> String {
    let text = match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .map(|b| match str_at(b, "type") {
                Some("text") => str_at(b, "text").unwrap_or_default().to_string(),
                Some(other) => format!("[{other}]"),
                None => String::new(),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    };
    cap(&text)
}
