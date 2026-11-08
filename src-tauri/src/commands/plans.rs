//! The Plan tab: reading a workspace's documents, publishing and removing one,
//! and exporting one. Every export picks its file in a native save dialog here,
//! so the renderer never hands over a path to write.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, Webview};
use tauri_plugin_dialog::DialogExt;

use crate::plans::model::{PlanDoc, PlanFormat, PlanState};
use crate::plans::{self, store};
use crate::platform::ports::PdfPrinter;
use crate::platform::Os;

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// A workspace's documents and task list (an older trace's HTML cards included).
#[tauri::command]
pub async fn load_plan_docs(workspace_id: String) -> Result<PlanState, String> {
    blocking(move || plans::load(&workspace_id)).await
}

/// Publish a document to a workspace's Plan tab: the `publish_document` tool, and
/// HTML an agent printed into its terminal (OSC 7700).
#[tauri::command]
pub async fn publish_plan_doc(
    app: AppHandle,
    workspace_id: String,
    format: PlanFormat,
    title: Option<String>,
    body: String,
    replaces: Option<String>,
) -> Result<PlanDoc, String> {
    blocking(move || {
        plans::publish(
            &app,
            &workspace_id,
            format,
            title.as_deref(),
            body,
            replaces.as_deref(),
        )
    })
    .await
}

/// Remove one version of a document, or (`all_versions`) the whole document.
#[tauri::command]
pub async fn remove_plan_doc(
    workspace_id: String,
    id: String,
    all_versions: bool,
) -> Result<(), String> {
    blocking(move || {
        store::update(&workspace_id, |f| store::remove(f, &id, all_versions)).map(|_| ())
    })
    .await
}

/// A file name for `title`: no characters a file system refuses, never empty.
fn file_name(title: &str, ext: &str) -> String {
    let safe: String = title
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let safe = safe.split_whitespace().collect::<Vec<_>>().join(" ");
    let safe = safe.trim_matches('.').chars().take(80).collect::<String>();
    let stem = if safe.is_empty() {
        "plan".to_string()
    } else {
        safe
    };
    format!("{stem}.{ext}")
}

/// `path` with `ext` on the end, if the user typed a name without it.
fn with_ext(mut path: PathBuf, ext: &str) -> PathBuf {
    let has = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext));
    if !has {
        let mut name = path
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        name.push(format!(".{ext}"));
        path.set_file_name(name);
    }
    path
}

/// Ask where to save `title` as `ext`. `None` when the user cancels.
fn ask_path(
    app: &AppHandle,
    title: &str,
    ext: &str,
    kind: &str,
) -> Result<Option<PathBuf>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title(format!("Save as {kind}"))
        .set_file_name(file_name(title, ext))
        .add_filter(kind, &[ext])
        .blocking_save_file();
    match picked {
        None => Ok(None),
        Some(p) => p
            .into_path()
            .map(|p| Some(with_ext(p, ext)))
            .map_err(|e| e.to_string()),
    }
}

/// Save a document as its own file: Markdown as `.md`, HTML as `.html`. Returns the
/// path written, or `None` if the user cancelled.
#[tauri::command]
pub async fn export_plan_doc(
    app: AppHandle,
    workspace_id: String,
    id: String,
) -> Result<Option<String>, String> {
    blocking(move || {
        let doc = store::load(&workspace_id)?
            .docs
            .into_iter()
            .find(|d| d.id == id)
            .ok_or("That document is gone.")?;
        let (ext, kind) = match doc.format {
            PlanFormat::Markdown => ("md", "Markdown"),
            PlanFormat::Html => ("html", "HTML"),
        };
        let Some(path) = ask_path(&app, &doc.title, ext, kind)? else {
            return Ok(None);
        };
        std::fs::write(&path, doc.body.as_bytes())
            .map_err(|e| format!("Couldn't write {}: {e}", path.display()))?;
        Ok(Some(path.display().to_string()))
    })
    .await
}

/// How a PDF export went.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PdfExport {
    Saved {
        path: String,
    },
    Cancelled,
    /// This webview can't write a PDF itself: the renderer opens the print dialog.
    UsePrintDialog,
}

/// Print the page as it is now (the renderer has put the document in its print
/// layout) to a PDF the user picks.
#[tauri::command]
pub async fn export_plan_pdf(
    app: AppHandle,
    webview: Webview,
    title: String,
) -> Result<PdfExport, String> {
    if !Os::prints_to_pdf() {
        return Ok(PdfExport::UsePrintDialog);
    }
    let picked = {
        let app = app.clone();
        blocking(move || ask_path(&app, &title, "pdf", "PDF")).await?
    };
    let Some(path) = picked else {
        return Ok(PdfExport::Cancelled);
    };
    let done = Os::print_to_pdf(&webview, &path);
    blocking(move || done.recv().map_err(|e| e.to_string())?).await?;
    // The dialog may have taken focus from the window; give it back.
    if let Some(window) = app.get_window(crate::browser::guard::APP_WEBVIEW) {
        let _ = window.set_focus();
    }
    Ok(PdfExport::Saved {
        path: path.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_become_safe_file_names() {
        assert_eq!(file_name("Plan: v2 / rollout?", "md"), "Plan v2 rollout.md");
        assert_eq!(file_name("  ..  ", "pdf"), "plan.pdf");
        assert_eq!(file_name("a\u{7}b", "html"), "a b.html");
        assert_eq!(file_name(&"x".repeat(200), "md").len(), 83);
    }

    #[test]
    fn a_missing_extension_is_added() {
        assert_eq!(
            with_ext(PathBuf::from("/t/plan"), "md"),
            PathBuf::from("/t/plan.md")
        );
        assert_eq!(
            with_ext(PathBuf::from("/t/plan.MD"), "md"),
            PathBuf::from("/t/plan.MD")
        );
        assert_eq!(
            with_ext(PathBuf::from("/t/plan.v2"), "pdf"),
            PathBuf::from("/t/plan.v2.pdf")
        );
    }
}
