//! The Browser tab: its pages (`browser::store`) and their native webviews
//! (`browser::webview`). Async throughout: a webview is made on the UI thread, and a
//! sync command would already be on it, waiting.

use tauri::AppHandle;

use crate::browser::store::{BrowserFile, BrowserPage, Opener};
use crate::browser::webview::{self, Action, Bounds};
use crate::browser::{self, Opened};

/// A workspace's pages and which one the tab shows.
#[tauri::command]
pub async fn browser_pages(workspace_id: String) -> Result<BrowserFile, String> {
    browser::load(&workspace_id)
}

/// Open a URL in the tab: `open_browser` (`by` agent), or the user's "Open page".
#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    workspace_id: String,
    url: String,
    title: Option<String>,
    new_tab: bool,
    by: Opener,
) -> Result<Opened, String> {
    let url = crate::commands::sandbox_preview::for_workspace(&workspace_id, url).await;
    browser::open(&app, &workspace_id, &url, title.as_deref(), new_tab, by)
}

/// The address bar: load `url` in one page.
#[tauri::command]
pub async fn browser_go(
    app: AppHandle,
    workspace_id: String,
    page_id: String,
    url: String,
) -> Result<BrowserPage, String> {
    let url = crate::commands::sandbox_preview::for_workspace(&workspace_id, url).await;
    browser::go(&app, &workspace_id, &page_id, &url)
}

#[tauri::command]
pub async fn browser_select(
    app: AppHandle,
    workspace_id: String,
    page_id: String,
) -> Result<(), String> {
    browser::select(&app, &workspace_id, &page_id)
}

#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    workspace_id: String,
    page_id: String,
) -> Result<(), String> {
    browser::close_page(&app, &workspace_id, &page_id)
}

/// Lay a page over its pane (physical pixels of the window) and show it.
#[tauri::command]
pub async fn browser_show(
    app: AppHandle,
    workspace_id: String,
    page_id: String,
    bounds: Bounds,
) -> Result<(), String> {
    browser::show(&app, &workspace_id, &page_id, bounds)
}

/// Hide a page (its pane went, its tab isn't in front, or something covers it).
#[tauri::command]
pub async fn browser_hide(app: AppHandle, workspace_id: String, page_id: String) {
    webview::hide(&app, &workspace_id, &page_id);
}

/// Back, forward, reload, stop.
#[tauri::command]
pub async fn browser_act(
    app: AppHandle,
    workspace_id: String,
    page_id: String,
    action: Action,
) -> Result<(), String> {
    webview::act(&app, &workspace_id, &page_id, action)
}
