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
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, PhysicalSize, Rect, Url, Webview,
    WebviewBuilder, WebviewUrl,
};

use super::store::{self, BrowserPage};
use super::url_rules;

/// The renderer hears about each page on this event (only the main webview does).
pub const EVENT: &str = "browser-view";
pub const LABEL_PREFIX: &str = "browser-";
/// Live webviews at most; past it, the least recently shown is closed (it reopens
/// at its URL when shown again).
const MAX_LIVE: usize = 6;

/// Links that would open a new window open in the page instead. The opener plugin's
/// script (injected into every webview) would otherwise catch them and ask trace,
/// which a page may not, so they'd do nothing. Running first, in the capture phase,
/// this drops `target=_blank` for the click (the page's own handlers still run) and
/// turns a Ctrl/Shift-click into a plain navigation.
const SAME_PAGE_LINKS: &str = r#"(() => {
  addEventListener("click", (e) => {
    if (e.button !== 0) return;
    const a = e.composedPath().find((n) => n instanceof Element && n.localName === "a");
    if (!a || !/^https?:/i.test(a.href)) return;
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      e.preventDefault();
      location.href = a.href;
    } else if (a.target === "_blank") {
      a.removeAttribute("target");
      setTimeout(() => a.setAttribute("target", "_blank"));
    }
  }, true);
})();"#;

/// Live pages, least recently shown first.
static LIVE: Mutex<Vec<String>> = Mutex::new(Vec::new());

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

fn emit(app: &AppHandle, ws: &str, page: &str, event: ViewEvent) {
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
}

/// Close the least recently shown pages past [`MAX_LIVE`].
fn evict(app: &AppHandle) {
    let extra: Vec<String> = {
        let live = LIVE.lock().unwrap_or_else(|e| e.into_inner());
        let n = live.len().saturating_sub(MAX_LIVE);
        live[..n].to_vec()
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
    Ok(true)
}

/// Create `page`'s webview at its URL, at `bounds`.
pub fn create(app: &AppHandle, ws: &str, page: &BrowserPage, bounds: Bounds) -> Result<(), String> {
    let label = label_for(ws, &page.id);
    if place(app, ws, &page.id, bounds)? {
        return Ok(());
    }
    let url = Url::parse(&page.url).map_err(|e| e.to_string())?;
    url_rules::check_url(&url, &app_origins(app))?;
    let window = app
        .get_window(crate::browser::guard::APP_WEBVIEW)
        .ok_or("trace's window isn't open.")?;
    let builder = build(app, ws, &page.id, &label, url)?;
    let rect = bounds.rect();
    window
        .add_child(builder, rect.position, rect.size)
        .map_err(|e| format!("Couldn't open the page: {e}"))?;
    touch(&label);
    evict(app);
    Ok(())
}

fn build(
    app: &AppHandle,
    ws: &str,
    page: &str,
    label: &str,
    url: Url,
) -> Result<WebviewBuilder<tauri::Wry>, String> {
    let data_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("browser");
    let origins = app_origins(app);
    let (a1, w1, p1) = (app.clone(), ws.to_string(), page.to_string());
    let (a2, w2, p2) = (app.clone(), ws.to_string(), page.to_string());
    let (a3, w3, p3) = (app.clone(), ws.to_string(), page.to_string());
    let (a4, w4, p4) = (app.clone(), ws.to_string(), page.to_string());
    let (a5, w5, p5, l5) = (
        app.clone(),
        ws.to_string(),
        page.to_string(),
        label.to_string(),
    );
    let origins_nav = origins.clone();
    Ok(WebviewBuilder::new(label, WebviewUrl::External(url))
        .data_directory(data_dir)
        .focused(false)
        .initialization_script_for_all_frames(SAME_PAGE_LINKS)
        .on_navigation(move |url| match url_rules::check_url(url, &origins_nav) {
            Ok(_) => true,
            // The first load of a frame-less popup, and pages' own about:blank.
            Err(_) if url.as_str() == "about:blank" => true,
            Err(reason) => {
                emit(
                    &a1,
                    &w1,
                    &p1,
                    ViewEvent::Blocked {
                        url: url.to_string(),
                        reason,
                        download: false,
                    },
                );
                false
            }
        })
        .on_page_load(move |_view, load| {
            let url = load.url().to_string();
            match load.event() {
                PageLoadEvent::Started => emit(&a2, &w2, &p2, ViewEvent::Loading { url }),
                PageLoadEvent::Finished => {
                    remember(&w2, &p2, &url);
                    emit(&a2, &w2, &p2, ViewEvent::Loaded { url });
                }
            }
        })
        .on_document_title_changed(move |_view, title| {
            emit(&a3, &w3, &p3, ViewEvent::Title { title });
        })
        .on_download(move |_view: Webview, event| {
            if let DownloadEvent::Requested { url, .. } = event {
                let reason =
                    "Downloads don't run in trace. Open the page in your browser to download it."
                        .into();
                emit(
                    &a4,
                    &w4,
                    &p4,
                    ViewEvent::Blocked {
                        url: url.to_string(),
                        reason,
                        download: true,
                    },
                );
            }
            false
        })
        // A popup (target=_blank, window.open) opens in this same page instead.
        .on_new_window(move |url, _features| {
            match url_rules::check_url(&url, &origins) {
                Ok(_) => {
                    let (app, label) = (a5.clone(), l5.clone());
                    tauri::async_runtime::spawn(async move {
                        if let Some(view) = app.get_webview(&label) {
                            let _ = view.navigate(url);
                        }
                    });
                }
                Err(reason) => {
                    emit(
                        &a5,
                        &w5,
                        &p5,
                        ViewEvent::Blocked {
                            url: url.to_string(),
                            reason,
                            download: false,
                        },
                    );
                }
            }
            NewWindowResponse::Deny
        }))
}

/// A finished load lands in the page's history (best-effort, off the UI thread).
fn remember(ws: &str, page: &str, url: &str) {
    let (ws, page, url) = (ws.to_string(), page.to_string(), url.to_string());
    std::thread::spawn(move || {
        let now = chrono::Utc::now().timestamp_millis();
        let _ = store::update(&ws, |f| {
            if let Some(p) = f.pages.iter_mut().find(|p| p.id == page) {
                store::visit(p, &url, now);
            }
        });
    });
}

fn live_view(app: &AppHandle, ws: &str, page: &str) -> Option<Webview> {
    app.get_webview(&label_for(ws, page))
}

pub fn hide(app: &AppHandle, ws: &str, page: &str) {
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
