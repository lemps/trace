//! A user turn as the `content` of Claude's stream-json user message: plain text,
//! or text plus image blocks for attached pictures. Other attachments are named
//! in the text by path, for Claude to read itself.

use std::path::Path;

use base64::Engine;
use serde_json::{json, Value};

use crate::agent_session::UserMessage;

/// Largest image sent inline; the API rejects bigger ones anyway.
const MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024;

pub fn user_content(message: &UserMessage) -> Value {
    if message.attachments.is_empty() {
        return Value::String(message.text.clone());
    }
    let mut images = Vec::new();
    let mut named = Vec::new();
    for path in &message.attachments {
        match image_block(Path::new(path)) {
            Some(block) => images.push(block),
            None => named.push(path.as_str()),
        }
    }
    let mut text = message.text.clone();
    if !named.is_empty() {
        text.push_str("\n\nAttached files:");
        for path in named {
            text.push_str(&format!("\n- {path}"));
        }
    }
    let mut blocks = vec![json!({"type": "text", "text": text})];
    blocks.extend(images);
    Value::Array(blocks)
}

fn image_block(path: &Path) -> Option<Value> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let media = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => return None,
    };
    if std::fs::metadata(path).ok()?.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(json!({
        "type": "image",
        "source": {"type": "base64", "media_type": media, "data": data},
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_stays_a_string_and_files_are_named() {
        let plain = UserMessage {
            text: "hi".into(),
            attachments: vec![],
        };
        assert_eq!(user_content(&plain), json!("hi"));
        let with_file = UserMessage {
            text: "look".into(),
            attachments: vec!["/tmp/notes.txt".into()],
        };
        let v = user_content(&with_file);
        assert_eq!(v[0]["type"], "text");
        assert!(v[0]["text"].as_str().unwrap().ends_with("- /tmp/notes.txt"));
    }
}
