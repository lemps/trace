//! The Browser tab's pages as native child webviews of trace's window: one per page,
//! laid over the pane the renderer says it's in (CSS pixels, mapped onto the window
//! here: `Bounds`) and hidden whenever that pane isn't showing it.
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

/// Where a page goes: its element's rect in the renderer's CSS pixels, and the
/// renderer's viewport in the same pixels. The ratio between that viewport and
/// trace's webview as it really is on screen is measured here rather than taken
/// from `devicePixelRatio`, which WKWebView leaves alone when the interface is
/// zoomed (`setZoom`): any scale, display or zoom, comes out right.
#[derive(serde::Deserialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub view_width: f64,
    pub view_height: f64,
}

/// How a CSS pixel of trace's webview maps into its window's content view.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Frame {
    /// Physical pixels per CSS pixel, across and down.
    scale: (f64, f64),
    /// Where trace's webview starts in the content view, in physical pixels.
    offset: (f64, f64),
}

impl Bounds {
    fn rect(self, frame: Frame) -> Rect {
        let (sx, sy) = frame.scale;
        let (ox, oy) = frame.offset;
        let left = (self.x * sx + ox).round();
        let top = (self.y * sy + oy).round();
        let right = ((self.x + self.width) * sx + ox).round();
        let bottom = ((self.y + self.height) * sy + oy).round();
        Rect {
            position: PhysicalPosition::new(left as i32, top as i32).into(),
            size: PhysicalSize::new(
                (right - left).max(1.0) as u32,
                (bottom - top).max(1.0) as u32,
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

/// Measure how trace's page sits in its window for `bounds`. The renderer measures
/// from the top-left of what it shows, but a child webview is placed in the window's
/// content view, which on macOS runs under the title bar too (the window is
/// full-size-content). Depending on the build, trace's webview either starts below
/// the bar or spans it with WebKit insetting the page; either way what's above the
/// page is the content view's height less the page's, which is what's measured.
/// Without a title bar (fullscreen, Windows, Linux) that's 0.
fn frame_for(app: &AppHandle, bounds: &Bounds) -> Frame {
    let plain = Frame {
        scale: (1.0, 1.0),
        offset: (0.0, 0.0),
    };
    let (Some(window), Some(main)) = (
        app.get_window(crate::browser::guard::APP_WEBVIEW),
        app.get_webview(crate::browser::guard::APP_WEBVIEW),
    ) else {
        return plain;
    };
    let (Ok(content), Ok(app_view)) = (window.inner_size(), main.size()) else {
        return plain;
    };
    frame_from(
        (f64::from(content.width), f64::from(content.height)),
        (f64::from(app_view.width), f64::from(app_view.height)),
        (bounds.view_width, bounds.view_height),
    )
}

/// `frame_for`'s arithmetic: the content view's and trace's webview's physical sizes,
/// and the renderer's viewport in CSS pixels. The scale is read across, where nothing
/// is inset; down, the page is the bottom of the content view.
fn frame_from(content: (f64, f64), app_view: (f64, f64), css_view: (f64, f64)) -> Frame {
    let scale = if css_view.0 > 0.0 {
        app_view.0 / css_view.0
    } else {
        1.0
    };
    let page_height = css_view.1 * scale;
    let above = if css_view.1 > 0.0 {
        (content.1 - page_height).max(0.0)
    } else {
        0.0
    };
    Frame {
        scale: (scale, scale),
        offset: (0.0, above),
    }
}

/// Move a live page to `bounds` and show it. False if it has no webview yet.
pub fn place(app: &AppHandle, ws: &str, page_id: &str, bounds: Bounds) -> Result<bool, String> {
    let label = label_for(ws, page_id);
    let Some(view) = app.get_webview(&label) else {
        return Ok(false);
    };
    view.set_bounds(bounds.rect(frame_for(app, &bounds)))
        .map_err(|e| e.to_string())?;
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
    let rect = bounds.rect(frame_for(app, &bounds));
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

#[cfg(test)]
mod tests {
    use super::*;

    fn placed(b: Bounds, f: Frame) -> (i32, i32, u32, u32) {
        let r = b.rect(f);
        let (tauri::Position::Physical(p), tauri::Size::Physical(s)) = (r.position, r.size) else {
            panic!("rects are physical");
        };
        (p.x, p.y, s.width, s.height)
    }

    const SLOT: Bounds = Bounds {
        x: 100.0,
        y: 200.0,
        width: 800.0,
        height: 500.0,
        view_width: 1000.0,
        view_height: 700.0,
    };

    #[test]
    fn a_retina_window_with_a_title_bar_offsets_by_the_bar_and_doubles() {
        // 1000×700 CSS on a 2× display, under a 28pt (56px) title bar.
        let f = frame_from((2000.0, 1456.0), (2000.0, 1400.0), (1000.0, 700.0));
        assert_eq!(placed(SLOT, f), (200, 456, 1600, 1000));
    }

    #[test]
    fn a_webview_spanning_the_title_bar_with_its_page_inset_offsets_the_same() {
        // trace's webview fills the whole content view; WebKit insets the page 56px.
        let f = frame_from((2000.0, 1456.0), (2000.0, 1456.0), (1000.0, 700.0));
        assert_eq!(placed(SLOT, f), (200, 456, 1600, 1000));
    }

    #[test]
    fn a_zoomed_interface_scales_by_what_is_on_screen_not_by_devicepixelratio() {
        // At 125% the same 2000px webview holds only 800×560 CSS pixels.
        let zoomed = Bounds {
            view_width: 800.0,
            view_height: 560.0,
            ..SLOT
        };
        let f = frame_from((2000.0, 1456.0), (2000.0, 1456.0), (800.0, 560.0));
        assert_eq!(placed(zoomed, f), (250, 556, 2000, 1250));
    }

    #[test]
    fn without_a_title_bar_in_the_content_view_there_is_no_offset() {
        let f = frame_from((1000.0, 700.0), (1000.0, 700.0), (1000.0, 700.0));
        assert_eq!(placed(SLOT, f), (100, 200, 800, 500));
    }

    #[test]
    fn an_empty_viewport_falls_back_to_one_to_one() {
        let f = frame_from((1000.0, 700.0), (1000.0, 700.0), (0.0, 0.0));
        assert_eq!(f.scale, (1.0, 1.0));
        assert_eq!(f.offset, (0.0, 0.0));
    }
}
