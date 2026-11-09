//! A still of trace as the user sees it. The page is one snapshot; each visible
//! child webview (a Browser-tab page) is another, with where it sits on the page,
//! and the driver lays them over the page (site/scripts/lib/bridge.mjs).

use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;

use super::capture;
use crate::platform::{
    ports::{Area, PageSnapshot},
    Os,
};

/// A child webview's snapshot and its place on the page, in CSS pixels.
#[derive(Serialize)]
pub struct Layer {
    pub file: String,
    pub area: Area,
}

/// The page's snapshot at `path`, and the layers to put over it.
#[derive(Serialize)]
pub struct Still {
    pub layers: Vec<Layer>,
}

/// Snapshot the `width` × `height` page of `main` to `path`, and with `children`
/// every visible child webview beside it (`<path stem>.child<n>.png`).
pub fn take(
    main: &tauri::Webview,
    path: PathBuf,
    (width, height): (f64, f64),
    children: bool,
) -> Result<Still, String> {
    let page = Area {
        x: 0.0,
        y: 0.0,
        width,
        height,
    };
    capture::snapshot(main, path.clone(), Some(page))?;
    let mut layers = Vec::new();
    let frame = Os::frame_in_window(main).filter(|_| children);
    let Some(frame) = frame else {
        return Ok(Still { layers });
    };
    // The page fills its view's bottom: the window's title bar lies over the top.
    let top = frame.y + frame.height - height;
    for (label, view) in main.app_handle().webviews() {
        if label == main.label() {
            continue;
        }
        let Some(at) = Os::frame_in_window(&view) else {
            continue;
        };
        let file = path.with_extension(format!("child{}.png", layers.len()));
        capture::snapshot(&view, file.clone(), None)?;
        layers.push(Layer {
            file: file.display().to_string(),
            area: Area {
                x: at.x - frame.x,
                y: at.y - top,
                ..at
            },
        });
    }
    Ok(Still { layers })
}
