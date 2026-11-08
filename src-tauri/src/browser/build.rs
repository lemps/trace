//! How a Browser page's webview is built: where it keeps its data, and what it does
//! on each navigation, load, title, download and popup. Every navigation goes through
//! `url_rules`; popups open in the same page; downloads are refused.

use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, Url, Webview, WebviewBuilder, WebviewUrl};

use super::url_rules;
use super::webview::{app_origins, emit, ViewEvent, DATA_STORE};

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

pub(super) fn build(
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
    let l1 = label.to_string();
    Ok(WebviewBuilder::new(label, WebviewUrl::External(url))
        .data_directory(data_dir)
        .data_store_identifier(DATA_STORE)
        .focused(false)
        .initialization_script_for_all_frames(SAME_PAGE_LINKS)
        .on_navigation(move |url| match url_rules::check_url(url, &origins_nav) {
            // A link to 0.0.0.0 goes to loopback instead, where it can load.
            Ok(_) => match url_rules::loopback_for_any(url) {
                Some(to) => {
                    let (app, label) = (a1.clone(), l1.clone());
                    tauri::async_runtime::spawn(async move {
                        if let Some(view) = app.get_webview(&label) {
                            let _ = view.navigate(to);
                        }
                    });
                    false
                }
                None => true,
            },
            // Pages' own blank and srcdoc documents (frames, on platforms that ask
            // about frames too).
            Err(_) if url.scheme() == "about" => true,
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
                    super::history::remember(&a2, &w2, &p2, &url);
                    let at = load.url();
                    let external = url_rules::check_url(at, &[])
                        .is_ok_and(|r| r == url_rules::Reach::External);
                    let host = url_rules::display_host(at);
                    emit(
                        &a2,
                        &w2,
                        &p2,
                        ViewEvent::Loaded {
                            url,
                            host,
                            external,
                        },
                    );
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
