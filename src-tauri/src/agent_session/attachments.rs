//! Files attached to a chat message. A file picked from disk is sent by its own
//! path; one pasted or dropped into the composer arrives as bytes with no path,
//! so it's saved here first (user-only, under the app dir) and sent by that path.
//! The adapters (`claude::content`, `codex::input`) inline pictures and name the rest.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use super::UserMessage;

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

/// The message as the chat shows it: its text, then the attached files' names,
/// so the bubble records what went with it (the agent gets the files themselves).
pub fn shown_text(message: &UserMessage) -> String {
    if message.attachments.is_empty() {
        return message.text.clone();
    }
    let names: Vec<String> = message
        .attachments
        .iter()
        .map(|p| {
            let name = Path::new(p)
                .file_name()
                .map_or_else(|| p.clone(), |n| n.to_string_lossy().into_owned());
            format!("`{}`", display_name(&name))
        })
        .collect();
    let list = format!("Attached: {}", names.join(", "));
    if message.text.trim().is_empty() {
        list
    } else {
        format!("{}\n\n{list}", message.text)
    }
}

/// A saved attachment's name without the unique prefix `save` gave it.
fn display_name(name: &str) -> &str {
    match name.split_once('-') {
        Some((prefix, rest))
            if prefix.len() == 8
                && prefix.chars().all(|c| c.is_ascii_hexdigit())
                && !rest.is_empty() =>
        {
            rest
        }
        _ => name,
    }
}

#[cfg(test)]
mod tests {
    use super::{safe_name, shown_text};
    use crate::agent_session::UserMessage;

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
    fn names_the_attachments_under_the_text() {
        let message = UserMessage {
            text: "Look".into(),
            attachments: vec![
                "/x/attachments/0a1b2c3d-image.png".into(),
                "/repo/notes-v2.txt".into(),
            ],
        };
        assert_eq!(
            shown_text(&message),
            "Look\n\nAttached: `image.png`, `notes-v2.txt`"
        );
        let bare = UserMessage {
            text: " ".into(),
            attachments: vec!["/repo/a.md".into()],
        };
        assert_eq!(shown_text(&bare), "Attached: `a.md`");
    }
}
