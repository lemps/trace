//! The plain folder a session runs in when it has no repo, so that no session needs
//! git. Either one the user picked, which trace never creates or deletes, or a scratch
//! folder trace made under its own data dir, which lives and dies with the session.

use std::path::{Path, PathBuf};

use crate::commands::session::ScratchSession;

/// Where trace makes a folder for a session with no repo and no chosen folder.
pub(crate) fn scratch_root() -> PathBuf {
    crate::helpers::trace_dir().join("sessions")
}

/// A new scratch folder's path. Named after the session so it reads well in the
/// header; the id's prefix keeps two sessions with one title apart.
fn scratch_folder(title: &str, id: &str) -> PathBuf {
    let short_id: String = id.chars().take(8).collect();
    let slug = crate::helpers::slugify(title);
    scratch_root().join(if slug.is_empty() {
        short_id
    } else {
        format!("{slug}-{short_id}")
    })
}

/// Whether `folder` is directly inside `root`, i.e. a scratch folder trace owns and
/// may delete. Anything else is the user's own folder and must never be removed.
/// The `file_name` check rejects `<root>/..`, whose parent is also `<root>`.
fn is_child_of(root: &Path, folder: &Path) -> bool {
    folder.parent() == Some(root) && folder.file_name().is_some()
}

/// Delete a session's scratch folder along with the session. Best-effort, and a
/// no-op for repo sessions and folders the user picked.
pub(crate) fn remove_scratch_folder(session: &ScratchSession) {
    if let Some(folder) = session.folder.as_deref().map(Path::new) {
        if is_child_of(&scratch_root(), folder) {
            let _ = std::fs::remove_dir_all(folder);
        }
    }
}

/// The folder a folder-backed session runs in. When about to run there (`create`),
/// a missing scratch folder is remade, but a missing folder of the user's is an
/// error: making a new empty one would hide that their files have moved.
pub(crate) fn folder_cwd(root: &Path, folder: &str, create: bool) -> Result<String, String> {
    let path = Path::new(folder);
    if create && !path.is_dir() {
        if !is_child_of(root, path) {
            return Err(format!("This session's folder no longer exists: {folder}"));
        }
        std::fs::create_dir_all(path).map_err(|e| format!("Couldn't create {folder}: {e}"))?;
    }
    Ok(folder.to_string())
}

/// The folder for a session without a repo: the user's choice if it exists,
/// otherwise a new scratch folder.
pub(crate) fn resolve_folder(
    folder: Option<String>,
    title: &str,
    id: &str,
) -> Result<String, String> {
    if let Some(folder) = folder
        .map(|f| f.trim().to_string())
        .filter(|f| !f.is_empty())
    {
        let path = Path::new(&folder);
        if !path.is_absolute() || !path.is_dir() {
            return Err(format!("{folder} isn't a folder."));
        }
        return Ok(folder);
    }
    let path = scratch_folder(title, id);
    std::fs::create_dir_all(&path).map_err(|e| format!("Couldn't create a folder: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{folder_cwd, is_child_of};
    use std::path::Path;

    #[test]
    fn only_direct_children_of_the_scratch_root_are_ours_to_delete() {
        let root = Path::new("/data/trace/sessions");
        assert!(is_child_of(root, &root.join("spike-1a2b3c4d")));
        for not_ours in [
            "/data/trace/sessions",
            "/data/trace/sessions/..",
            "/data/trace/sessions/a/b",
            "/data/trace/sessions/a/..",
            "/Users/me/project",
            "/",
        ] {
            assert!(!is_child_of(root, Path::new(not_ours)), "{not_ours}");
        }
    }

    #[test]
    fn folder_cwd_remakes_scratch_folders_but_not_the_users() {
        let root = std::env::temp_dir().join(format!("trace-folder-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&root).expect("temp root");

        let scratch = root.join("scratch");
        let scratch_str = scratch.to_str().expect("utf-8 path");
        assert_eq!(
            folder_cwd(&root, scratch_str, true).as_deref(),
            Ok(scratch_str)
        );
        assert!(scratch.is_dir());

        let elsewhere =
            std::env::temp_dir().join(format!("trace-gone-{}", crate::helpers::new_id()));
        let elsewhere_str = elsewhere.to_str().expect("utf-8 path");
        assert!(folder_cwd(&root, elsewhere_str, true).is_err());
        assert!(!elsewhere.exists());
        // Only reading where it would be (the editor, the header) never fails or creates.
        assert_eq!(
            folder_cwd(&root, elsewhere_str, false).as_deref(),
            Ok(elsewhere_str)
        );
        assert!(!elsewhere.exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
