//! The sound that plays when an agent wants you (off by default).
//!
//! Each OS already ships alert sounds, so trace offers those (`platform::SoundPlayer`)
//! rather than bundling audio of its own, and will play any file the user picks.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::platform::ports::SoundPlayer;
use crate::platform::Os;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundOption {
    /// Absolute path — also the stored preference, so a custom file is just
    /// another option.
    pub path: String,
    /// The file's name without extension ("Glass"), for the picker.
    pub name: String,
    /// "system" or "you" — where it came from.
    pub source: String,
}

fn is_audio_for(path: &Path, extensions: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .is_some_and(|e| extensions.contains(&e.as_str()))
}

fn is_audio(path: &Path) -> bool {
    is_audio_for(path, Os::audio_extensions())
}

/// Sounds to choose from: the system's, then the user's own, each alphabetical.
#[tauri::command]
pub fn list_notify_sounds() -> Vec<SoundOption> {
    let mut out = Vec::new();
    let Some(home) = dirs::home_dir() else {
        return out;
    };
    for folder in Os::sound_folders(&home) {
        let Ok(entries) = std::fs::read_dir(&folder.path) else {
            continue;
        };
        let mut found: Vec<SoundOption> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_file() && is_audio(p))
            .filter_map(|p| {
                Some(SoundOption {
                    name: p.file_stem()?.to_string_lossy().to_string(),
                    path: p.to_string_lossy().to_string(),
                    source: folder.source.to_string(),
                })
            })
            .collect();
        found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out.extend(found);
    }
    out
}

/// Play `path` once, without waiting for it: a notification sound must never
/// hold up the caller. Rejects anything that isn't an existing audio file.
#[tauri::command]
pub fn play_notify_sound(path: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    if !file.is_file() {
        return Err("That sound file no longer exists.".to_string());
    }
    if !is_audio(&file) {
        return Err(format!("{} isn't an audio file trace can play.", path));
    }
    let mut child = Os::play(&file).map_err(|e| format!("Couldn't play the sound: {e}"))?;
    // Reap it off-thread — an unwaited child lingers as a zombie, and a sound
    // plays for a second or two.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_audio, is_audio_for, list_notify_sounds};
    use std::path::Path;

    #[test]
    fn only_playable_files_are_offered() {
        for sound in list_notify_sounds() {
            assert!(is_audio(Path::new(&sound.path)), "{}", sound.path);
        }
    }

    #[test]
    fn recognises_audio_by_extension_in_any_case() {
        let allowed = ["aiff", "wav"];
        assert!(is_audio_for(Path::new("/s/Glass.aiff"), &allowed));
        assert!(is_audio_for(Path::new("/s/My Sound.WAV"), &allowed));
        assert!(!is_audio_for(Path::new("/s/notes.txt"), &allowed));
        assert!(!is_audio_for(Path::new("/s/noextension"), &allowed));
    }
}
