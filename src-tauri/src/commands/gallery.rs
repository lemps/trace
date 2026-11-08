//! The Gallery tab: sets of images (`gallery`). The images themselves load through
//! the `trace-img` protocol (`gallery::protocol`), not a command.

use tauri::AppHandle;

use crate::gallery::scan::Listing;
use crate::gallery::{self, NewSet, OpenHow, SetView};

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// A new set and its first listing.
#[derive(serde::Serialize)]
pub struct Shown {
    pub set: SetView,
    pub listing: Listing,
}

/// `show_images`: add a set to a workspace's Gallery.
#[tauri::command]
pub async fn gallery_show(
    app: AppHandle,
    workspace_id: String,
    paths: Vec<String>,
    title: Option<String>,
    recursive: bool,
    glob: Option<String>,
) -> Result<Shown, String> {
    blocking(move || {
        let new = NewSet {
            inputs: &paths,
            title: title.as_deref(),
            recursive,
            glob: glob.as_deref(),
        };
        gallery::show(&app, &workspace_id, new).map(|(set, listing)| Shown { set, listing })
    })
    .await
}

#[tauri::command]
pub async fn gallery_sets(workspace_id: String) -> Result<Vec<SetView>, String> {
    blocking(move || gallery::sets(&workspace_id)).await
}

/// A set's images as they are now (the tab re-lists a shown set every few seconds).
#[tauri::command]
pub async fn gallery_list(workspace_id: String, set_id: String) -> Result<Listing, String> {
    blocking(move || gallery::listing(&workspace_id, &set_id)).await
}

#[tauri::command]
pub async fn gallery_remove(
    app: AppHandle,
    workspace_id: String,
    set_id: String,
) -> Result<(), String> {
    blocking(move || gallery::remove(&app, &workspace_id, &set_id)).await
}

/// Open one of a set's images in its default app, or show it in its folder.
#[tauri::command]
pub async fn gallery_open(
    app: AppHandle,
    workspace_id: String,
    set_id: String,
    path: String,
    how: OpenHow,
) -> Result<(), String> {
    blocking(move || gallery::open(&app, &workspace_id, &set_id, &path, how)).await
}
