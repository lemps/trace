//! A user turn as Codex's `UserInput` items: the text, attached pictures as
//! `localImage` (Codex reads the file itself), and other attachments named in
//! the text by path, as the Claude adapter does.

use std::path::Path;

use serde_json::{json, Value};

use crate::agent_session::UserMessage;

const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];

pub fn user_input(message: &UserMessage) -> Vec<Value> {
    let mut text = message.text.clone();
    let mut images = Vec::new();
    let mut named = Vec::new();
    for path in &message.attachments {
        if is_image(Path::new(path)) {
            images.push(json!({"type": "localImage", "path": path}));
        } else {
            named.push(path.as_str());
        }
    }
    if !named.is_empty() {
        text.push_str("\n\nAttached files:");
        for path in named {
            text.push_str(&format!("\n- {path}"));
        }
    }
    let mut input = vec![json!({"type": "text", "text": text, "text_elements": []})];
    input.extend(images);
    input
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pictures_go_by_path_and_other_files_are_named() {
        let message = UserMessage {
            text: "look".into(),
            attachments: vec!["/tmp/a.PNG".into(), "/tmp/notes.txt".into()],
        };
        let input = user_input(&message);
        assert_eq!(input.len(), 2);
        assert_eq!(input[0]["type"], "text");
        assert!(input[0]["text"]
            .as_str()
            .unwrap()
            .ends_with("- /tmp/notes.txt"));
        assert_eq!(
            input[1],
            json!({"type": "localImage", "path": "/tmp/a.PNG"})
        );
    }
}
