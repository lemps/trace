//! Each workspace's Browser tab on disk: its pages and each page's URL history, in
//! `<config dir>/browser/<workspace id>.json` (user-only through `helpers::persist`).
//! Never page content: no cookies, storage or screenshots. The file is untrusted when
//! read, so every page and URL is checked again and a bad one is dropped on its own.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Url;

use super::url_rules;
use crate::helpers::persist::{self, Style};

/// Pages kept per workspace; opening another drops the least recently used.
pub const MAX_PAGES: usize = 8;
/// URLs remembered per page, newest last.
pub const MAX_HISTORY: usize = 50;
const MAX_TITLE: usize = 200;

/// Who opened a page. An agent's page on another host gets a notice in the tab.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Opener {
    Agent,
    User,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPage {
    pub id: String,
    /// What the page is called: the agent's title, else the document's.
    pub title: String,
    /// The URL the page shows (and reopens at).
    pub url: String,
    /// Where it has been, oldest first, without repeats in a row.
    pub history: Vec<String>,
    pub opened_by: Opener,
    /// Unix ms of the last open or navigation: least recently used goes first.
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserFile {
    pub pages: Vec<BrowserPage>,
    /// The page the tab shows.
    pub active: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct RawFile {
    #[serde(default)]
    pages: Vec<Value>,
    #[serde(default)]
    active: Option<Value>,
}

pub fn browser_path(workspace_id: &str) -> PathBuf {
    crate::helpers::trace_dir().join("browser").join(format!(
        "{}.json",
        crate::agent_session::store::file_stem(workspace_id)
    ))
}

pub fn load(workspace_id: &str) -> Result<BrowserFile, String> {
    let raw: RawFile = persist::read_or_default(&browser_path(workspace_id))?;
    Ok(validate(raw))
}

/// Change a workspace's file under its lock. Also gives the ids of pages the change
/// pushed past [`MAX_PAGES`], whose webviews the caller closes.
pub fn update<R>(
    workspace_id: &str,
    f: impl FnOnce(&mut BrowserFile) -> R,
) -> Result<(R, Vec<String>), String> {
    let path = browser_path(workspace_id);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    persist::update(&path, Style::Compact, |raw: &mut RawFile| {
        let mut file = validate(std::mem::take(raw));
        let out = f(&mut file);
        let dropped = trim(&mut file);
        *raw = RawFile {
            pages: file
                .pages
                .iter()
                .filter_map(|p| serde_json::to_value(p).ok())
                .collect(),
            active: file.active.clone().map(Value::String),
        };
        (out, dropped)
    })
}

/// A URL worth keeping: loadable by the tab and of sane length.
fn keepable(url: &str) -> bool {
    Url::parse(url)
        .ok()
        .is_some_and(|u| url_rules::check_url(&u, &[]).is_ok())
}

fn clip(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

fn validate(raw: RawFile) -> BrowserFile {
    let mut pages: Vec<BrowserPage> = Vec::new();
    for value in raw.pages {
        let Ok(mut page) = serde_json::from_value::<BrowserPage>(value) else {
            continue;
        };
        if page.id.is_empty() || page.id.len() > 64 || pages.iter().any(|p| p.id == page.id) {
            continue;
        }
        if !keepable(&page.url) {
            continue;
        }
        page.title = clip(&page.title, MAX_TITLE);
        page.history.retain(|u| keepable(u));
        pages.push(page);
    }
    let active = raw
        .active
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|id| pages.iter().any(|p| &p.id == id));
    let mut file = BrowserFile { pages, active };
    trim(&mut file);
    file
}

/// Cap history and pages; the ids of the pages dropped.
fn trim(file: &mut BrowserFile) -> Vec<String> {
    let mut dropped = Vec::new();
    for page in &mut file.pages {
        page.history.dedup();
        let extra = page.history.len().saturating_sub(MAX_HISTORY);
        page.history.drain(..extra);
    }
    while file.pages.len() > MAX_PAGES {
        let Some(oldest) = file
            .pages
            .iter()
            .enumerate()
            .filter(|(_, p)| Some(&p.id) != file.active.as_ref())
            .min_by_key(|(_, p)| p.updated_at)
            .map(|(i, _)| i)
        else {
            break;
        };
        dropped.push(file.pages.remove(oldest).id);
    }
    if file.active.is_none() {
        file.active = file.pages.last().map(|p| p.id.clone());
    }
    dropped
}

/// Note that `page` is now at `url` (a navigation it made, or one trace asked for).
pub fn visit(page: &mut BrowserPage, url: &str, now: i64) {
    if !keepable(url) {
        return;
    }
    page.url = url.to_string();
    if page.history.last().map(String::as_str) != Some(url) {
        page.history.push(url.to_string());
    }
    page.updated_at = now;
}

/// Add a page, or reuse the active one (`new_tab` false), and point it at `url`.
pub fn open(
    file: &mut BrowserFile,
    url: &str,
    title: Option<&str>,
    new_tab: bool,
    by: Opener,
    now: i64,
) -> BrowserPage {
    let reuse = if new_tab { None } else { file.active.clone() };
    let index = reuse.and_then(|id| file.pages.iter().position(|p| p.id == id));
    let index = match index {
        Some(i) => i,
        None => {
            file.pages.push(BrowserPage {
                id: crate::helpers::new_id(),
                title: String::new(),
                url: url.to_string(),
                history: Vec::new(),
                opened_by: by,
                updated_at: now,
            });
            file.pages.len() - 1
        }
    };
    let page = &mut file.pages[index];
    page.opened_by = by;
    page.title = clip(title.map(str::trim).unwrap_or_default(), MAX_TITLE);
    visit(page, url, now);
    file.active = Some(page.id.clone());
    page.clone()
}

/// A deleted workspace's file goes with it.
pub fn forget(workspace_id: &str) {
    persist::remove(&browser_path(workspace_id));
}

/// A session's conversation now belongs to an issue: so do its pages. If the issue
/// has pages already, the session's join them (the issue's active page stays active,
/// and past [`MAX_PAGES`] the least recently used go). Gives the ids of the issue's
/// pages that were dropped.
pub fn transfer(from: &str, to: &str) -> Vec<String> {
    let (src, dst) = (browser_path(from), browser_path(to));
    if !src.exists() {
        return Vec::new();
    }
    if !dst.exists() {
        let _ = std::fs::rename(&src, &dst);
        return Vec::new();
    }
    let Ok(moved) = load(from) else {
        return Vec::new();
    };
    match update(to, |file| merge(file, moved)) {
        Ok(((), dropped)) => {
            forget(from);
            dropped
        }
        Err(_) => Vec::new(),
    }
}

/// Add `other`'s pages to `file` (page ids are unique UUIDs).
fn merge(file: &mut BrowserFile, other: BrowserFile) {
    for page in other.pages {
        if !file.pages.iter().any(|p| p.id == page.id) {
            file.pages.push(page);
        }
    }
    if file.active.is_none() {
        file.active = other.active;
    }
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
