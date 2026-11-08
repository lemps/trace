//! The Browser tab: pages an agent (`open_browser`) or the user opened, each shown
//! in a native child webview over its pane (`webview`). What's kept per workspace is
//! only each page's URL and history (`store`); what may load is `url_rules`; who may
//! call trace is `guard`.

pub mod guard;
pub mod store;
pub mod url_rules;
pub mod webview;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::activity::{self, ActivityKind};
use store::{BrowserFile, BrowserPage, Opener};
use url_rules::Reach;

/// The renderer reloads a workspace's pages when this names it.
pub const PAGES_EVENT: &str = "browser-pages";

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
    let page = store::update(ws, |f| {
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
    let page = store::update(ws, |f| {
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

pub fn select(ws: &str, page_id: &str) -> Result<(), String> {
    store::update(ws, |f| {
        if f.pages.iter().any(|p| p.id == page_id) {
            f.active = Some(page_id.to_string());
        }
    })
}

pub fn close_page(app: &AppHandle, ws: &str, page_id: &str) -> Result<(), String> {
    webview::close(app, ws, page_id);
    store::update(ws, |f| {
        f.pages.retain(|p| p.id != page_id);
        if f.active.as_deref() == Some(page_id) {
            f.active = f.pages.last().map(|p| p.id.clone());
        }
    })?;
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
    if webview::place(app, ws, page_id, bounds)? {
        return Ok(());
    }
    let file = store::load(ws)?;
    let page = file
        .pages
        .iter()
        .find(|p| p.id == page_id)
        .ok_or("That page is closed.")?;
    webview::create(app, ws, page, bounds)
}
