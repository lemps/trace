//! A workspace's documents on disk: `<config dir>/plans/<workspace id>.json`,
//! user-only through `helpers::persist`. The file is untrusted when read (an older
//! or newer trace wrote it, or a hand edit did): each document is checked on its
//! own, so one bad entry is dropped rather than the whole file.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::model::{NewDoc, PlanDoc, PlanFile, PlanFormat, TaskList};
use crate::helpers::persist::{self, Style};

/// Longest Markdown body kept; longer is cut with a marker.
pub const MAX_MARKDOWN: usize = 512 * 1024;
/// Longest HTML body kept (the render bridge takes ~6 MiB); longer isn't kept at all,
/// since cut HTML is broken HTML.
pub const MAX_HTML: usize = 6 * 1024 * 1024;
/// Versions kept per document; the oldest go first.
pub const MAX_VERSIONS: usize = 20;
/// Documents (series) kept per workspace; the least recently updated go first.
pub const MAX_SERIES: usize = 40;
/// All bodies of a workspace together; past it, whole old series go.
pub const MAX_TOTAL: usize = 24 * 1024 * 1024;
/// Capture keys remembered, newest kept.
const MAX_REFS: usize = 2000;
const MAX_TITLE: usize = 200;
const MAX_TASKS: usize = 200;

/// Where `workspace_id`'s documents live.
pub fn plan_path(workspace_id: &str) -> PathBuf {
    crate::helpers::trace_dir().join("plans").join(format!(
        "{}.json",
        crate::agent_session::store::file_stem(workspace_id)
    ))
}

/// The file as JSON values, so each part is validated by hand.
#[derive(Default, Serialize, Deserialize)]
struct RawFile {
    #[serde(default)]
    docs: Vec<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    tasks: Option<Value>,
    #[serde(default)]
    refs: Vec<Value>,
}

/// A workspace's validated documents (empty when there's no file).
pub fn load(workspace_id: &str) -> Result<PlanFile, String> {
    let raw: RawFile = persist::read_or_default(&plan_path(workspace_id))?;
    Ok(validate(raw))
}

/// Change a workspace's file under its lock. Returns what `f` returns.
pub fn update<R>(workspace_id: &str, f: impl FnOnce(&mut PlanFile) -> R) -> Result<R, String> {
    let path = plan_path(workspace_id);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    persist::update(&path, Style::Compact, |raw: &mut RawFile| {
        let mut file = validate(std::mem::take(raw));
        let out = f(&mut file);
        trim(&mut file);
        *raw = to_raw(&file);
        out
    })
}

fn to_raw(file: &PlanFile) -> RawFile {
    RawFile {
        docs: file
            .docs
            .iter()
            .filter_map(|d| serde_json::to_value(d).ok())
            .collect(),
        tasks: file
            .tasks
            .as_ref()
            .and_then(|t| serde_json::to_value(t).ok()),
        refs: file.refs.iter().cloned().map(Value::String).collect(),
    }
}

/// Keep only well-formed documents, within the caps, newest version numbers sane.
fn validate(raw: RawFile) -> PlanFile {
    let mut seen = std::collections::HashSet::new();
    let docs = raw
        .docs
        .into_iter()
        .filter_map(|v| serde_json::from_value::<PlanDoc>(v).ok())
        .filter_map(clean_doc)
        .filter(|d| seen.insert(d.id.clone()))
        .collect();
    let tasks = raw
        .tasks
        .and_then(|v| serde_json::from_value::<TaskList>(v).ok())
        .map(|mut t| {
            t.items.truncate(MAX_TASKS);
            t
        });
    let refs = raw
        .refs
        .into_iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .filter(|r| !r.is_empty() && r.len() <= 300)
        .collect();
    let mut file = PlanFile { docs, tasks, refs };
    trim(&mut file);
    file
}

fn clean_doc(mut d: PlanDoc) -> Option<PlanDoc> {
    let id_ok = !d.id.is_empty() && d.id.len() <= 64;
    if !id_ok || d.series.is_empty() || d.series.len() > 300 || d.version == 0 {
        return None;
    }
    d.title = clip_chars(d.title.trim(), MAX_TITLE);
    if d.title.is_empty() {
        d.title = "Untitled".to_string();
    }
    d.body = fit_body(d.format, d.body)?;
    Some(d)
}

/// `body` within its format's cap: Markdown is cut with a marker, HTML refused.
pub fn fit_body(format: PlanFormat, body: String) -> Option<String> {
    match format {
        PlanFormat::Html if body.len() > MAX_HTML => None,
        PlanFormat::Html => Some(body),
        PlanFormat::Markdown if body.len() <= MAX_MARKDOWN => Some(body),
        PlanFormat::Markdown => {
            let mut cut = MAX_MARKDOWN;
            while !body.is_char_boundary(cut) {
                cut -= 1;
            }
            Some(format!(
                "{}\n\n… (cut: the plan was too long to keep)",
                &body[..cut]
            ))
        }
    }
}

pub fn clip_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// Add `new` as the next version of its series. `None` when it was seen before
/// (its reference is known) or says nothing new (same body as the latest version).
pub fn add(file: &mut PlanFile, new: NewDoc, now: u64) -> Option<PlanDoc> {
    if new
        .reference
        .as_ref()
        .is_some_and(|r| file.refs.contains(r))
    {
        return None;
    }
    let body = fit_body(new.format, new.body)?;
    let latest = file
        .docs
        .iter()
        .filter(|d| d.series == new.series)
        .max_by_key(|d| d.version);
    // Not a new version, and its reference isn't used up: Claude can name a plan
    // before rewriting it (ExitPlanMode's input is read from the plan file as the
    // call is made), and the same call may carry the new text later (its result).
    if latest.is_some_and(|d| d.body == body && d.format == new.format) {
        return None;
    }
    if let Some(r) = &new.reference {
        file.refs.push(r.clone());
    }
    let version = latest.map_or(1, |d| d.version + 1);
    let title = clip_chars(new.title.trim(), MAX_TITLE);
    let doc = PlanDoc {
        id: crate::helpers::new_id(),
        series: new.series,
        title: if title.is_empty() {
            "Untitled".into()
        } else {
            title
        },
        source: new.source,
        format: new.format,
        body,
        // Never before the version it follows, whatever the clock says.
        created_at: latest.map_or(now, |d| now.max(d.created_at)),
        version,
    };
    file.docs.push(doc.clone());
    Some(doc)
}

/// Apply the caps: versions per series, series per workspace, total size, refs.
fn trim(file: &mut PlanFile) {
    file.docs.sort_by_key(|d| (d.created_at, d.version));
    // Newest first, so what's kept is the most recent of everything.
    let mut keep = vec![false; file.docs.len()];
    {
        let mut series_seen: Vec<&str> = Vec::new();
        let mut versions: std::collections::HashMap<&str, usize> = Default::default();
        let mut total = 0usize;
        for (i, d) in file.docs.iter().enumerate().rev() {
            let count = versions.entry(d.series.as_str()).or_default();
            if !series_seen.contains(&d.series.as_str()) {
                if series_seen.len() >= MAX_SERIES {
                    continue;
                }
                series_seen.push(d.series.as_str());
            }
            if *count >= MAX_VERSIONS || total + d.body.len() > MAX_TOTAL {
                continue;
            }
            *count += 1;
            total += d.body.len();
            keep[i] = true;
        }
    }
    let mut keep = keep.into_iter();
    file.docs.retain(|_| keep.next().unwrap_or(false));
    if file.refs.len() > MAX_REFS {
        file.refs.drain(..file.refs.len() - MAX_REFS);
    }
}

/// Replace the task list. `false` when it's what was there already.
pub fn set_tasks(file: &mut PlanFile, tasks: TaskList) -> bool {
    if file.tasks.as_ref().is_some_and(|t| t.items == tasks.items) {
        return false;
    }
    let mut tasks = tasks;
    tasks.items.truncate(MAX_TASKS);
    file.tasks = Some(tasks);
    true
}

/// Remove a document: one version (`id`) or, with `all_versions`, its whole series.
pub fn remove(file: &mut PlanFile, id: &str, all_versions: bool) -> bool {
    let Some(series) = file
        .docs
        .iter()
        .find(|d| d.id == id)
        .map(|d| d.series.clone())
    else {
        return false;
    };
    file.docs.retain(|d| {
        if all_versions {
            d.series != series
        } else {
            d.id != id
        }
    });
    true
}

/// The workspace is gone: its documents go with it.
pub fn forget(workspace_id: &str) {
    let path = plan_path(workspace_id);
    let _ = std::fs::remove_file(&path);
    let mut lock = path.into_os_string();
    lock.push(".lock");
    let _ = std::fs::remove_file(lock);
}

/// A session's conversation now belongs to an issue: so do its documents.
pub fn transfer(from: &str, to: &str) {
    let (src, dst) = (plan_path(from), plan_path(to));
    if src.exists() && !dst.exists() {
        let _ = std::fs::rename(&src, &dst);
    }
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
