//! The Plan tab's documents: plans and reports an agent produced, kept per
//! workspace with their versions, and its live task list. See `model` for what a
//! document is, `capture` for where plans come from, `store` for the file.
//!
//! Every producer goes through [`record`] (a document) or [`set_tasks`] (the task
//! list), which save and tell the renderer (`plan-doc`, `plan-tasks`).

pub mod capture;
pub mod legacy;
pub mod model;
pub mod store;
pub mod transcript;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::agent_session::journal::{JournalRow, PlanItem};
use model::{NewDoc, PlanDoc, PlanFormat, PlanSource, PlanState, TaskList};

/// `plan-doc`'s payload: a document was added to the workspace.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocEvent<'a> {
    workspace_id: &'a str,
    doc: &'a PlanDoc,
}

/// `plan-tasks`'s payload: the workspace's task list now.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TasksEvent<'a> {
    workspace_id: &'a str,
    tasks: &'a TaskList,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Save `new` as a document of `workspace_id` and tell the renderer. `None` when
/// it wasn't new (seen before, or the same as the latest version).
pub fn record(app: &AppHandle, workspace_id: &str, new: NewDoc) -> Result<Option<PlanDoc>, String> {
    let doc = store::update(workspace_id, |file| store::add(file, new, now_ms()))?;
    if let Some(doc) = &doc {
        let _ = app.emit("plan-doc", DocEvent { workspace_id, doc });
    }
    Ok(doc)
}

/// Replace `workspace_id`'s task list and tell the renderer, if it changed.
pub fn set_tasks(app: &AppHandle, workspace_id: &str, items: Vec<PlanItem>) {
    let tasks = TaskList {
        items,
        updated_at: now_ms(),
    };
    match store::update(workspace_id, |file| store::set_tasks(file, tasks.clone())) {
        Ok(true) => {
            let _ = app.emit(
                "plan-tasks",
                TasksEvent {
                    workspace_id,
                    tasks: &tasks,
                },
            );
        }
        Ok(false) => {}
        Err(e) => eprintln!("trace: {e}"),
    }
}

/// Apply what a capture found: its documents and task list.
pub fn apply(app: &AppHandle, workspace_id: &str, effects: capture::Effects) {
    for doc in effects.docs {
        if let Err(e) = record(app, workspace_id, doc) {
            eprintln!("trace: {e}");
        }
    }
    if let Some(items) = effects.tasks {
        set_tasks(app, workspace_id, items);
    }
}

/// A chat agent's journal row, as it's written: plan mode and task lists.
pub fn on_row(app: &AppHandle, workspace_id: &str, row: &JournalRow) {
    let Some(found) = capture::from_row(row) else {
        return;
    };
    let effects = capture::apply_all(workspace_id, vec![found]);
    apply(app, workspace_id, effects);
}

/// A document the agent published (`trace-render`, `publish_document`). With
/// `replaces` (an existing document's id) it's that document's next version;
/// otherwise a document with the same title is.
pub fn publish(
    app: &AppHandle,
    workspace_id: &str,
    format: PlanFormat,
    title: Option<&str>,
    body: String,
    replaces: Option<&str>,
) -> Result<PlanDoc, String> {
    if body.trim().is_empty() {
        return Err("The document is empty.".into());
    }
    if format == PlanFormat::Html && body.len() > store::MAX_HTML {
        return Err(format!(
            "The document is too large ({} MiB; HTML is kept up to {} MiB).",
            body.len() / (1024 * 1024),
            store::MAX_HTML / (1024 * 1024)
        ));
    }
    let given = title.map(str::trim).filter(|t| !t.is_empty());
    let found = match format {
        PlanFormat::Markdown => model::markdown_title(&body, ""),
        PlanFormat::Html => model::html_title(&body, ""),
    };
    let title = given
        .map(str::to_string)
        .or_else(|| (!found.is_empty()).then_some(found));
    let earlier = match replaces.filter(|r| !r.is_empty()) {
        Some(id) => {
            let file = store::load(workspace_id)?;
            let doc = file.docs.into_iter().find(|d| d.id == id);
            Some(doc.ok_or_else(|| format!("No document {id} in this workspace's Plan tab."))?)
        }
        None => None,
    };
    // Untitled, it has no series to join: the same text published again (an
    // HTML page re-printed into a terminal) is the document already there.
    if earlier.is_none() && title.is_none() {
        let same = store::load(workspace_id)?
            .docs
            .into_iter()
            .find(|d| d.format == format && d.body == body);
        if let Some(doc) = same {
            return Ok(doc);
        }
    }
    let series = match (&earlier, &title) {
        (Some(d), _) => d.series.clone(),
        (None, Some(t)) => model::published_series(format, t),
        // Untitled HTML stands alone, as the old HTML tab's cards did.
        (None, None) => format!("html:{}", crate::helpers::new_id()),
    };
    let title = title
        .or_else(|| earlier.as_ref().map(|d| d.title.clone()))
        .unwrap_or_else(|| "Untitled document".into());
    let new = NewDoc {
        series,
        title,
        source: PlanSource::Published,
        format,
        body,
        reference: None,
    };
    let series = new.series.clone();
    match record(app, workspace_id, new)? {
        Some(doc) => Ok(doc),
        // The same text as its latest version: that version stands.
        None => store::load(workspace_id)?
            .docs
            .into_iter()
            .filter(|d| d.series == series)
            .max_by_key(|d| d.version)
            .ok_or_else(|| "The document couldn't be saved.".into()),
    }
}

/// What the renderer shows for a workspace, an older trace's HTML cards included.
pub fn load(workspace_id: &str) -> Result<PlanState, String> {
    legacy::import(workspace_id);
    let file = store::load(workspace_id)?;
    Ok(PlanState {
        docs: file.docs,
        tasks: file.tasks,
    })
}

/// The workspace is gone for good: its documents and old cards go with it.
pub fn forget(workspace_id: &str) {
    store::forget(workspace_id);
    legacy::forget(workspace_id);
}

/// A session's conversation now belongs to an issue: so do its documents.
pub fn transfer(from: &str, to: &str) {
    legacy::import(from);
    store::transfer(from, to);
}
