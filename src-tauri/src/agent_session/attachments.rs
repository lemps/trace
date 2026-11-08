//! Files attached to a chat message. A file picked from disk is sent by its own
//! path; one pasted or dropped into the composer arrives as bytes with no path,
//! so it's saved here first (user-only, under the app dir) and sent by that path.
//! The adapters (`claude::content`, `codex::input`) inline pictures and name the rest;
//! the chat draws pictures from `preview`.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub mod preview;

/// Largest pasted or dropped file kept. Bigger ones are better picked from disk.
pub const MAX_BYTES: usize = 25 * 1024 * 1024;

/// Saved attachments older than this are swept on the next save: long enough for
/// a queued message or a resend, short enough that pastes don't pile up.
const KEEP_FOR: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// Longest file name kept (before the unique prefix).
const MAX_NAME: usize = 80;

fn dir() -> PathBuf {
    crate::helpers::trace_dir().join("attachments")
}

/// Save a pasted or dropped file's `bytes` and return the absolute path to send.
/// `name` is only a hint for the file name (and its extension, which decides
/// whether it goes to the agent as a picture).
pub fn save(name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("That file is empty.".to_string());
    }
    if bytes.len() > MAX_BYTES {
        return Err(format!(
            "That file is over {} MB; attach it from disk instead.",
            MAX_BYTES / (1024 * 1024)
        ));
    }
    let dir = dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Couldn't create the attachments folder: {e}"))?;
    sweep(&dir);
    let id = crate::helpers::new_id();
    let path = dir.join(format!("{}-{}", &id[..8], safe_name(name)));
    std::fs::write(&path, bytes).map_err(|e| format!("Couldn't save the attachment: {e}"))?;
    crate::helpers::restrict_perms(&path);
    Ok(path.to_string_lossy().into_owned())
}

/// A plain file name from whatever the renderer sent: the last path segment,
/// only `[A-Za-z0-9._-]`, never hidden or empty.
fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = cleaned.trim_start_matches('.');
    // Keep the end, where the extension is.
    let start = trimmed.len().saturating_sub(MAX_NAME);
    let kept = &trimmed[start..];
    if kept.is_empty() {
        "attachment".to_string()
    } else {
        kept.to_string()
    }
}

/// Remove saved attachments past `KEEP_FOR`. Best-effort.
fn sweep(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > KEEP_FOR);
        if old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// The `paths` that are still files: a composer draft can outlive what it attached
/// (`sweep` removes old pastes, and a picked file can be moved or deleted).
pub fn existing(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|p| Path::new(p.as_str()).is_file())
        .cloned()
        .collect()
}

/// The MIME type of a picture the agents take inline (png, jpg, gif, webp), by
/// extension; `None` for anything else, which is sent by name.
pub fn image_media_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{existing, image_media_type, safe_name};
    use std::path::Path;

    #[test]
    fn keeps_a_plain_name_and_its_extension() {
        assert_eq!(safe_name("Screen Shot 1.png"), "Screen-Shot-1.png");
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name("C:\\x\\notes.txt"), "notes.txt");
        assert_eq!(safe_name(".hidden"), "hidden");
        assert_eq!(safe_name(""), "attachment");
        let long = format!("{}.png", "a".repeat(200));
        assert!(safe_name(&long).ends_with(".png"));
        assert_eq!(safe_name(&long).len(), 80);
    }

    #[test]
    fn knows_the_pictures_agents_take_inline() {
        assert_eq!(image_media_type(Path::new("/a/b.PNG")), Some("image/png"));
        assert_eq!(image_media_type(Path::new("x.jpg")), Some("image/jpeg"));
        assert_eq!(image_media_type(Path::new("x.webp")), Some("image/webp"));
        assert_eq!(image_media_type(Path::new("x.svg")), None);
        assert_eq!(image_media_type(Path::new("png")), None);
    }

    #[test]
    fn keeps_only_paths_that_are_files() {
        let file = std::env::temp_dir().join(format!("trace-att-{}", crate::helpers::new_id()));
        std::fs::write(&file, b"x").unwrap();
        let file_str = file.to_string_lossy().into_owned();
        let dir = std::env::temp_dir().to_string_lossy().into_owned();
        let gone = format!("{file_str}-gone");
        let kept = existing(&[gone, file_str.clone(), dir]);
        let _ = std::fs::remove_file(&file);
        assert_eq!(kept, vec![file_str]);
    }
}
