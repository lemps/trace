//! The homepage clip recorder's commands (`recording` builds only; see `recording`).
//! They're async so they run off the main thread, which the snapshots need.

use std::path::PathBuf;

use tauri::{LogicalSize, Webview};

use crate::platform::ports::Area;
use crate::recording::still::{self, Still};
use crate::recording::{self, capture, Bridge};

/// Where the recorder's driver listens, when trace was launched by it.
#[tauri::command]
pub async fn recording_bridge() -> Option<Bridge> {
    recording::bridge()
}

/// Size the window; the driver measures the page and corrects for the title bar.
#[tauri::command]
pub async fn recording_viewport(webview: Webview, width: f64, height: f64) -> Result<(), String> {
    if !(320.0..=4096.0).contains(&width) || !(240.0..=4096.0).contains(&height) {
        return Err("Unsupported viewport size.".into());
    }
    webview
        .window()
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

/// An absolute path the recorder named; a relative one would land wherever trace
/// was started.
fn absolute(path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Err("The recorder must give an absolute path.".into())
    }
}

/// The page's top-left `width` × `height` CSS pixels, where the page is drawn.
fn page_area(width: f64, height: f64) -> Result<Area, String> {
    if !(width > 0.0 && height > 0.0) {
        return Err("Unsupported page size.".into());
    }
    Ok(Area {
        x: 0.0,
        y: 0.0,
        width,
        height,
    })
}

/// Save one PNG of the `width` × `height` page to `path`; with `children`, the
/// visible child webviews too, as layers for the driver to lay over it.
#[tauri::command]
pub async fn recording_snapshot(
    webview: Webview,
    path: String,
    width: f64,
    height: f64,
    children: bool,
) -> Result<Still, String> {
    let path = absolute(&path)?;
    page_area(width, height)?;
    tauri::async_runtime::spawn_blocking(move || {
        still::take(&webview, path, (width, height), children)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Start writing frames of the `width` × `height` page into `dir` at `fps`. The
/// driver empties `dir` first; trace never deletes.
#[tauri::command]
pub async fn recording_capture_start(
    webview: Webview,
    dir: String,
    fps: u32,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let dir = absolute(&dir)?;
    let area = page_area(width, height)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    capture::start(webview, dir, fps, Some(area));
    Ok(())
}

/// Stop the capture; the frames written, in order.
#[tauri::command]
pub async fn recording_capture_stop() -> Result<Vec<capture::Frame>, String> {
    tauri::async_runtime::spawn_blocking(capture::stop)
        .await
        .map_err(|e| e.to_string())?
}
