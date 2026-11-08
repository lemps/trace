//! The Browser tab: pages an agent (`open_browser`) or the user opened, each shown
//! in a native child webview over its pane (`webview`). What's kept per workspace is
//! only each page's URL and history (`store`); what may load is `url_rules`; who may
//! call trace is `guard`.

mod build;
pub mod guard;
mod history;
pub mod store;
pub mod url_rules;
pub mod webview;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::activity::{self, ActivityKind};
use store::{BrowserFile, BrowserPage, Opener};
use url_rules::Reach;

/// The renderer reloads a workspace's pages when this names it.
pub const PAGES_EVENT: &str = "browser-pages";

/// trace, once a page has been shown: what closes pages when a workspace goes, from
/// code that has no handle of its own.
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Bumped each time pages leave a file: after they've left it, before their webviews
/// close. A show that read the file before a bump reads it again once its webview is
/// made, so a page closed meanwhile can't come back as an orphan.
static CLOSES: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub page: BrowserPage,
    pub reach: Reach,
    /// "localhost:5173", "example.com".
    pub host: String,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn pages_changed(app: &AppHandle, ws: &str) {
    let target = tauri::EventTarget::Webview {
        label: guard::APP_WEBVIEW.to_string(),
    };
    let _ = app.emit_to(target, PAGES_EVENT, json!({ "workspaceId": ws }));
}

/// Close the webviews of pages that have just left `ws`'s file.
fn closed(app: &AppHandle, ws: &str, pages: &[String]) {
    if pages.is_empty() {
        return;
    }
    CLOSES.fetch_add(1, Ordering::SeqCst);
    for page in pages {
        webview::close(app, ws, page);
    }
}

/// [`store::update`], closing any page it pushed past the cap.
fn change<R>(
    app: &AppHandle,
    ws: &str,
    f: impl FnOnce(&mut BrowserFile) -> R,
) -> Result<R, String> {
    let (out, dropped) = store::update(ws, f)?;
    closed(app, ws, &dropped);
    Ok(out)
}

pub fn load(ws: &str) -> Result<BrowserFile, String> {
    store::load(ws)
}

/// Open `url` in a workspace's Browser tab: the active page (or, `new_tab`, a new one).
pub fn open(
    app: &AppHandle,
    ws: &str,
    raw_url: &str,
    title: Option<&str>,
    new_tab: bool,
    by: Opener,
) -> Result<Opened, String> {
    if ws.is_empty() {
        return Err("trace couldn't tell which workspace this page is for.".into());
    }
    let (url, reach) = url_rules::check(raw_url, &webview::app_origins(app))?;
    let page = change(app, ws, |f| {
        store::open(f, url.as_str(), title, new_tab, by, now())
    })?;
    webview::navigate(app, ws, &page.id, url.clone())?;
    let host = url_rules::display_host(&url);
    if by == Opener::Agent {
        activity::record_agent(
            app,
            ws,
            ActivityKind::PageOpened,
            &format!("Opened {host} in the Browser tab"),
            json!({ "url": url.as_str(), "external": reach == Reach::External }),
        );
    }
    pages_changed(app, ws);
    Ok(Opened { page, reach, host })
}

/// The user typed an address (or picked one from the history) on a page.
pub fn go(app: &AppHandle, ws: &str, page_id: &str, raw_url: &str) -> Result<BrowserPage, String> {
    let (url, _) = url_rules::check(raw_url, &webview::app_origins(app))?;
    let page = change(app, ws, |f| {
        f.active = Some(page_id.to_string());
        let page = f.pages.iter_mut().find(|p| p.id == page_id)?;
        page.opened_by = Opener::User;
        store::visit(page, url.as_str(), now());
        Some(page.clone())
    })?
    .ok_or("That page is closed.")?;
    webview::navigate(app, ws, page_id, url)?;
    Ok(page)
}

pub fn select(app: &AppHandle, ws: &str, page_id: &str) -> Result<(), String> {
    change(app, ws, |f| {
        if f.pages.iter().any(|p| p.id == page_id) {
            f.active = Some(page_id.to_string());
        }
    })
}

pub fn close_page(app: &AppHandle, ws: &str, page_id: &str) -> Result<(), String> {
    change(app, ws, |f| {
        f.pages.retain(|p| p.id != page_id);
        if f.active.as_deref() == Some(page_id) {
            f.active = f.pages.last().map(|p| p.id.clone());
        }
    })?;
    closed(app, ws, &[page_id.to_string()]);
    pages_changed(app, ws);
    Ok(())
}

/// Show a page over its pane, (re)creating its webview at its URL as needed.
pub fn show(
    app: &AppHandle,
    ws: &str,
    page_id: &str,
    bounds: webview::Bounds,
) -> Result<(), String> {
    let _ = APP.set(app.clone());
    if webview::place(app, ws, page_id, bounds)? {
        return Ok(());
    }
    let closes = CLOSES.load(Ordering::SeqCst);
    let find = |file: BrowserFile| file.pages.into_iter().find(|p| p.id == page_id);
    let page = find(store::load(ws)?).ok_or("That page is closed.")?;
    webview::create(app, ws, &page, bounds)?;
    // Closed while its webview was being made: that webview goes too.
    if CLOSES.load(Ordering::SeqCst) != closes && find(store::load(ws)?).is_none() {
        webview::close(app, ws, page_id);
        return Err("That page is closed.".into());
    }
    Ok(())
}

/// A workspace is gone for good: its pages close and its file goes.
pub fn forget(ws: &str) {
    let pages = page_ids(ws);
    store::forget(ws);
    if let Some(app) = APP.get() {
        closed(app, ws, &pages);
        pages_changed(app, ws);
    }
}

/// A session's conversation now belongs to an issue, and so do its pages. They
/// reopen under the issue when shown, so the session's webviews close.
pub fn transfer(from: &str, to: &str) {
    let pages = page_ids(from);
    let dropped = store::transfer(from, to);
    if let Some(app) = APP.get() {
        closed(app, from, &pages);
        closed(app, to, &dropped);
        pages_changed(app, from);
        pages_changed(app, to);
    }
}

fn page_ids(ws: &str) -> Vec<String> {
    store::load(ws)
        .map(|f| f.pages.into_iter().map(|p| p.id).collect())
        .unwrap_or_default()
}
