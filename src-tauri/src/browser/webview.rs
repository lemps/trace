//! The Browser tab's pages as native child webviews of trace's window: one per page,
//! laid over the pane the renderer says it's in (physical pixels, so DPI and the
//! app's zoom are the renderer's to fold in) and hidden whenever that pane isn't
//! showing it.
//!
//! A page's webview is not trace's: its label (`browser-…`) is in no capability
//! (`capabilities/default.json` grants only the `main` webview), app commands from it
//! are refused (`guard`), the gallery's protocol refuses it, it keeps its own data
//! directory, and it only ever navigates to what `url_rules` allows.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, PhysicalSize, Rect, Url, Webview,
};

use super::store::BrowserPage;
use super::url_rules;

/// The renderer hears about each page on this event (only the main webview does).
pub const EVENT: &str = "browser-view";
pub const LABEL_PREFIX: &str = "browser-";
/// Live webviews at most; past it, the least recently shown is closed (it reopens
/// at its URL when shown again).
const MAX_LIVE: usize = 6;

/// Live pages, least recently shown first.
static LIVE: Mutex<Vec<String>> = Mutex::new(Vec::new());
/// Pages on screen now; never evicted, however long ago they were placed.
static SHOWN: Mutex<Vec<String>> = Mutex::new(Vec::new());
/// Held while a page's webview is made, so two shows can't both create it.
static CREATING: Mutex<()> = Mutex::new(());
/// Browser pages' own website data store on macOS, where `data_directory` is ignored.
pub(super) const DATA_STORE: [u8; 16] = *b"trace-browser-v1";

fn set_shown(label: &str, on: bool) {
    let mut shown = SHOWN.lock().unwrap_or_else(|e| e.into_inner());
    shown.retain(|l| l != label);
    if on {
        shown.push(label.to_string());
    }
}

/// Where a page goes, in the window's physical pixels.
#[derive(serde::Deserialize, Clone, Copy, Debug)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    fn rect(self) -> Rect {
        Rect {
            position: PhysicalPosition::new(self.x.round() as i32, self.y.round() as i32).into(),
            size: PhysicalSize::new(
                self.width.round().max(1.0) as u32,
                self.height.round().max(1.0) as u32,
            )
            .into(),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ViewEvent {
    Loading {
        url: String,
    },
    Loaded {
        url: String,
        /// "example.com": where the page ended up (after any redirects).
        host: String,
        /// Not loopback: an agent's page that lands here gets a notice.
        external: bool,
    },
    Title {
        title: String,
    },
    /// A navigation, popup or download the tab refused, and why.
    Blocked {
        url: String,
        reason: String,
        /// A download: the system browser can do it, so the tab offers that.
        download: bool,
    },
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Payload {
    workspace_id: String,
    page_id: String,
    #[serde(flatten)]
    event: ViewEvent,
}

pub fn label_for(workspace_id: &str, page_id: &str) -> String {
    let ws = crate::agent_session::store::file_stem(workspace_id);
    let page: String = page_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    format!("{LABEL_PREFIX}{ws}-{page}")
}

pub(super) fn emit(app: &AppHandle, ws: &str, page: &str, event: ViewEvent) {
    let payload = Payload {
        workspace_id: ws.to_string(),
        page_id: page.to_string(),
        event,
    };
    let target = EventTarget::Webview {
        label: crate::browser::guard::APP_WEBVIEW.to_string(),
    };
    let _ = app.emit_to(target, EVENT, payload);
}

/// trace's own origins in this build (the dev server's, in a dev build).
pub fn app_origins(app: &AppHandle) -> Vec<Url> {
    let mut out = Vec::new();
    if cfg!(debug_assertions) {
        if let Some(dev) = app.config().build.dev_url.clone() {
            out.push(dev);
        }
    }
    out
}

fn touch(label: &str) {
    let mut live = LIVE.lock().unwrap_or_else(|e| e.into_inner());
    live.retain(|l| l != label);
    live.push(label.to_string());
}

fn forget(label: &str) {
    LIVE.lock()
        .unwrap_or_else(|e| e.into_inner())
        .retain(|l| l != label);
    set_shown(label, false);
}

/// Close the least recently shown pages past [`MAX_LIVE`], never one on screen.
fn evict(app: &AppHandle) {
    let extra: Vec<String> = {
        let live = LIVE.lock().unwrap_or_else(|e| e.into_inner());
        let shown = SHOWN.lock().unwrap_or_else(|e| e.into_inner());
        let n = live.len().saturating_sub(MAX_LIVE);
        live.iter()
            .filter(|l| !shown.contains(l))
            .take(n)
            .cloned()
            .collect()
    };
    for label in extra {
        forget(&label);
        if let Some(view) = app.get_webview(&label) {
            let _ = view.close();
        }
    }
}

/// Move a live page to `bounds` and show it. False if it has no webview yet.
pub fn place(app: &AppHandle, ws: &str, page_id: &str, bounds: Bounds) -> Result<bool, String> {
    let label = label_for(ws, page_id);
    let Some(view) = app.get_webview(&label) else {
        return Ok(false);
    };
    view.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
    view.show().map_err(|e| e.to_string())?;
    touch(&label);
    set_shown(&label, true);
    Ok(true)
}

/// Create `page`'s webview at its URL, at `bounds`.
pub fn create(app: &AppHandle, ws: &str, page: &BrowserPage, bounds: Bounds) -> Result<(), String> {
    let label = label_for(ws, &page.id);
    let _one_at_a_time = CREATING.lock().unwrap_or_else(|e| e.into_inner());
    if place(app, ws, &page.id, bounds)? {
        return Ok(());
    }
    let url = Url::parse(&page.url).map_err(|e| e.to_string())?;
    url_rules::check_url(&url, &app_origins(app))?;
    let window = app
        .get_window(crate::browser::guard::APP_WEBVIEW)
        .ok_or("trace's window isn't open.")?;
    let builder = super::build::build(app, ws, &page.id, &label, url)?;
    let rect = bounds.rect();
    window
        .add_child(builder, rect.position, rect.size)
        .map_err(|e| format!("Couldn't open the page: {e}"))?;
    touch(&label);
    set_shown(&label, true);
    evict(app);
    Ok(())
}

fn live_view(app: &AppHandle, ws: &str, page: &str) -> Option<Webview> {
    app.get_webview(&label_for(ws, page))
}

pub fn hide(app: &AppHandle, ws: &str, page: &str) {
    set_shown(&label_for(ws, page), false);
    if let Some(view) = live_view(app, ws, page) {
        let _ = view.hide();
    }
}

pub fn close(app: &AppHandle, ws: &str, page: &str) {
    let label = label_for(ws, page);
    forget(&label);
    if let Some(view) = app.get_webview(&label) {
        let _ = view.close();
    }
}

/// Load `url` in a page that's live (a page that isn't opens at its stored URL).
pub fn navigate(app: &AppHandle, ws: &str, page: &str, url: Url) -> Result<(), String> {
    if let Some(view) = live_view(app, ws, page) {
        view.navigate(url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Back,
    Forward,
    Reload,
    Stop,
}

/// The toolbar's buttons. Only these fixed scripts are ever run in a page.
pub fn act(app: &AppHandle, ws: &str, page: &str, action: Action) -> Result<(), String> {
    let Some(view) = live_view(app, ws, page) else {
        return Ok(());
    };
    match action {
        Action::Reload => view.reload(),
        Action::Back => view.eval("history.back()"),
        Action::Forward => view.eval("history.forward()"),
        Action::Stop => view.eval("window.stop()"),
    }
    .map_err(|e| e.to_string())
}
