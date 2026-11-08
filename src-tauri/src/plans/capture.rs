//! Turning what an agent did into plan documents and its task list, from either
//! transport: a chat agent's journal rows (`on_row`) and a terminal agent's
//! transcript lines (`transcript`). Both reduce to the same few [`Found`]s, so
//! plan mode reads alike whichever way the agent runs.
//!
//! Claude's plan mode writes its plan to `~/.claude/plans/<name>.md`, then calls
//! ExitPlanMode, whose input carries the plan as Markdown (`plan`). The call is the
//! capture; a plan file written in a turn that ends without one (the agent stopped
//! to ask something) is captured at the turn's end, so the draft shows too. A plan
//! that says nothing new (same text as the latest version) isn't a new version.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

use super::model::{markdown_title, NewDoc, PlanFormat, PlanSource};
use crate::agent_session::journal::{JournalBody, JournalRow, PlanItem, ToolState, TurnState};

/// The series every plan-mode plan of a workspace joins.
pub const PLAN_MODE_SERIES: &str = "plan-mode";

/// What a row or a transcript line says about plans.
#[derive(Debug, PartialEq)]
pub enum Found {
    /// ExitPlanMode was called (`reference` is its call id, when known), with its
    /// plan if the input had it.
    ExitPlan {
        reference: Option<String>,
        plan: Option<String>,
    },
    /// The plan file was written or edited.
    PlanFile(PathBuf),
    /// The task list as it stands now.
    Tasks(Vec<PlanItem>),
    /// A turn ended.
    TurnEnd,
}

/// Whether `path` is one of Claude's plan files (`.claude/plans/*.md`).
pub fn is_plan_file(path: &str) -> bool {
    let p = path.replace('\\', "/").to_lowercase();
    p.contains("/.claude/plans/") && p.ends_with(".md")
}

fn plan_text(input: &Value) -> Option<String> {
    input
        .get("plan")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(str::to_string)
}

/// What one tool call says, from its name and input.
fn from_tool(id: &str, name: &str, input: &Value) -> Option<Found> {
    match name {
        "ExitPlanMode" => Some(Found::ExitPlan {
            reference: Some(format!("call:{id}")),
            plan: plan_text(input),
        }),
        "Write" | "Edit" | "MultiEdit" => {
            let path = input.get("file_path").and_then(Value::as_str)?;
            is_plan_file(path).then(|| Found::PlanFile(PathBuf::from(path)))
        }
        "TodoWrite" => {
            crate::agent_session::claude::tools::plan(input).map(|p| Found::Tasks(p.items))
        }
        _ => None,
    }
}

/// What a chat agent's journal row says. A tool counts once it has its input
/// (ExitPlanMode as soon as it's asked, a plan-file edit once it's done).
pub fn from_row(row: &JournalRow) -> Option<Found> {
    match &row.body {
        JournalBody::Tool(t) if t.parent_call_id.is_none() => {
            let found = from_tool(&t.call_id, &t.name, &t.input)?;
            let edit_done = !matches!(found, Found::PlanFile(_)) || t.state == ToolState::Completed;
            edit_done.then_some(found)
        }
        JournalBody::Plan(p) => Some(Found::Tasks(p.items.clone())),
        JournalBody::Turn(t) if t.state != TurnState::Running => Some(Found::TurnEnd),
        _ => None,
    }
}

/// What one line of a Claude transcript says. Subagents' lines (`isSidechain`)
/// are skipped: their task lists and files aren't the agent's plan.
pub fn from_transcript_line(line: &str) -> Vec<Found> {
    // Most lines are none of this; skip parsing them.
    if !(line.contains("ExitPlanMode") || line.contains("TodoWrite") || line.contains("plan")) {
        return Vec::new();
    }
    let Ok(v) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    if v.get("isSidechain").and_then(Value::as_bool) == Some(true) {
        return Vec::new();
    }
    let content = v
        .pointer("/message/content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    match v.get("type").and_then(Value::as_str) {
        Some("assistant") => content
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("tool_use"))
            .filter_map(|b| {
                let id = b.get("id").and_then(Value::as_str)?;
                let name = b.get("name").and_then(Value::as_str)?;
                from_tool(id, name, b.get("input").unwrap_or(&Value::Null))
            })
            .collect(),
        // ExitPlanMode's result repeats the plan (`toolUseResult.plan`), for a CLI
        // whose call input didn't carry it.
        Some("user") => {
            let plan = v.get("toolUseResult").and_then(plan_text);
            let id = content
                .iter()
                .find_map(|b| b.get("tool_use_id").and_then(Value::as_str));
            match (plan, id) {
                (Some(plan), Some(id)) => vec![Found::ExitPlan {
                    reference: Some(format!("call:{id}")),
                    plan: Some(plan),
                }],
                _ => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

/// What a terminal agent's `PermissionRequest` hook input says: the plan dialog
/// it opens carries the plan, before the transcript has the call (Claude writes
/// the call's line once it's answered).
pub fn from_permission(input: &Value) -> Option<Found> {
    if input.get("tool_name").and_then(Value::as_str) != Some("ExitPlanMode") {
        return None;
    }
    Some(Found::ExitPlan {
        reference: input
            .get("tool_use_id")
            .and_then(Value::as_str)
            .map(|id| format!("call:{id}")),
        plan: input.get("tool_input").and_then(plan_text),
    })
}

/// A capture's effect on a workspace: a document to record, a task list to set.
#[derive(Debug, Default, PartialEq)]
pub struct Effects {
    pub docs: Vec<NewDoc>,
    pub tasks: Option<Vec<PlanItem>>,
}

/// Per workspace: the plan file it last wrote, whether that's unrecorded, and
/// whether this turn already left plan mode (ExitPlanMode was called).
#[derive(Default)]
pub struct Tracker {
    plan_file: Option<PathBuf>,
    dirty: bool,
    exited: bool,
}

impl Tracker {
    /// Apply `found`; `read` loads a plan file (`read_plan_file` outside tests).
    pub fn apply(
        &mut self,
        found: Found,
        out: &mut Effects,
        read: &dyn Fn(&Path) -> Option<String>,
    ) {
        match found {
            Found::ExitPlan { reference, plan } => {
                // A chat row's input is capped (`journal::cap`): a cut plan is
                // read whole from its file when there is one.
                let cut = plan.as_deref().is_some_and(is_cut);
                let from_file = || self.plan_file.as_deref().and_then(read);
                let plan = if plan.is_none() || cut {
                    from_file().or(plan)
                } else {
                    plan
                };
                if let Some(body) = plan {
                    out.docs.push(plan_doc(body, reference));
                    self.dirty = false;
                }
                self.exited = true;
            }
            // Claude may write the plan file and call ExitPlanMode at once, and the
            // call's input is read from the file before the write lands: a write
            // after the call is the plan it asks about, so it's taken now.
            Found::PlanFile(path) if self.exited => {
                if let Some(body) = read(&path) {
                    out.docs.push(plan_doc(body, None));
                }
                self.plan_file = Some(path);
                self.dirty = false;
            }
            Found::PlanFile(path) => {
                self.plan_file = Some(path);
                self.dirty = true;
            }
            Found::Tasks(items) => out.tasks = Some(items),
            Found::TurnEnd => {
                self.exited = false;
                if self.dirty {
                    self.dirty = false;
                    if let Some(body) = self.plan_file.as_deref().and_then(read) {
                        out.docs.push(plan_doc(body, None));
                    }
                }
            }
        }
    }
}

/// Whether `text` was cut by `journal::cap`.
fn is_cut(text: &str) -> bool {
    text.ends_with(" more characters)")
        && text.chars().count() > crate::agent_session::journal::CAP_CHARS
}

fn plan_doc(body: String, reference: Option<String>) -> NewDoc {
    NewDoc {
        series: PLAN_MODE_SERIES.to_string(),
        title: markdown_title(&body, "Plan"),
        source: PlanSource::PlanMode,
        format: PlanFormat::Markdown,
        body,
        reference,
    }
}

/// Every workspace's tracker. Held only while one capture is applied.
pub static TRACKERS: Mutex<Option<HashMap<String, Tracker>>> = Mutex::new(None);

/// Apply `finds` to `workspace_id`'s tracker.
pub fn apply_all(workspace_id: &str, finds: Vec<Found>) -> Effects {
    let mut out = Effects::default();
    if finds.is_empty() {
        return out;
    }
    let mut guard = TRACKERS.lock().unwrap_or_else(|e| e.into_inner());
    let tracker = guard
        .get_or_insert_with(HashMap::new)
        .entry(workspace_id.to_string())
        .or_default();
    for f in finds {
        tracker.apply(f, &mut out, &read_plan_file);
    }
    out
}

/// A plan file's text, only from Claude's plans folder in the user's home: the
/// path came from an agent's tool call, so nothing else is ever read.
pub fn read_plan_file(path: &Path) -> Option<String> {
    let home = dirs::home_dir()?;
    let root = std::fs::canonicalize(home.join(".claude").join("plans")).ok()?;
    let file = std::fs::canonicalize(path).ok()?;
    let is_md = file
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    if !file.starts_with(&root) || !is_md {
        return None;
    }
    let meta = std::fs::metadata(&file).ok()?;
    if !meta.is_file() || meta.len() > (super::store::MAX_MARKDOWN as u64) * 2 {
        return None;
    }
    let text = std::fs::read_to_string(&file).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

#[cfg(test)]
#[path = "capture_tests.rs"]
mod tests;
