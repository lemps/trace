//! A page's finished loads, written to its history. `on_page_load` runs on the UI
//! thread, so the write happens elsewhere: on one worker, which takes loads in the
//! order they finished, so an earlier URL can never be saved over a later one. Once
//! written, the renderer hears the workspace's pages changed and reloads them.

use std::sync::{mpsc, Mutex, OnceLock};

use tauri::AppHandle;

use super::store;

struct Visit {
    app: AppHandle,
    ws: String,
    page: String,
    url: String,
    at: i64,
}

static WORKER: OnceLock<Mutex<mpsc::Sender<Visit>>> = OnceLock::new();

fn worker() -> &'static Mutex<mpsc::Sender<Visit>> {
    WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Visit>();
        std::thread::spawn(move || {
            for v in rx {
                write(&v);
            }
        });
        Mutex::new(tx)
    })
}

fn write(v: &Visit) {
    let found = super::change(&v.app, &v.ws, |f| {
        let page = f.pages.iter_mut().find(|p| p.id == v.page)?;
        store::visit(page, &v.url, v.at);
        Some(())
    });
    if matches!(found, Ok(Some(()))) {
        super::pages_changed(&v.app, &v.ws);
    }
}

/// `page` of `ws` finished loading `url`.
pub(super) fn remember(app: &AppHandle, ws: &str, page: &str, url: &str) {
    let visit = Visit {
        app: app.clone(),
        ws: ws.to_string(),
        page: page.to_string(),
        url: url.to_string(),
        at: super::now(),
    };
    let tx = worker().lock().unwrap_or_else(|e| e.into_inner());
    let _ = tx.send(visit);
}
