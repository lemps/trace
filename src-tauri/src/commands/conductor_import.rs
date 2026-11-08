//! Settings → Repositories → Import from Conductor. Thin wrappers over
//! `conductor_import`; the preview copies a large database and runs git per
//! repo, so both run off the main thread.

use crate::conductor_import::model::{Preview, Report, Selection};

/// Whether Conductor's database is on this computer (the entry point shows only then).
#[tauri::command]
pub fn conductor_import_available() -> bool {
    crate::conductor_import::detect()
}

/// What an import would bring over; `None` when Conductor isn't here.
#[tauri::command]
pub async fn conductor_import_preview() -> Result<Option<Preview>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if !crate::conductor_import::detect() {
            return Ok(None);
        }
        crate::conductor_import::preview().map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Import what the user ticked. Conductor is read again here, so only ids
/// (and edited setups) come from the renderer.
#[tauri::command]
pub async fn conductor_import_apply(selection: Selection) -> Result<Report, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let preview = crate::conductor_import::preview()?;
        Ok(crate::conductor_import::apply::apply(&preview, &selection))
    })
    .await
    .map_err(|e| e.to_string())?
}
