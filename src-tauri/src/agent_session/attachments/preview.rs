//! A picture attached to a chat message, as a `data:` URL the chat can draw: the
//! webview can't load local paths (no asset protocol, and `trace-img` serves only
//! Gallery sets), so the composer's chips and a sent message's strip ask for this.
//! Only the main webview can call it (`browser::guard` refuses every other one).

use std::path::Path;

use base64::Engine;
use serde::Serialize;

use super::image_media_type;

/// Largest picture previewed. The UI scales it down with CSS; no resizing here.
pub const MAX_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

/// Why there's no preview, for the chat to draw a plain chip instead.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PreviewError {
    /// Not a png, jpg, gif or webp (or a link to something that isn't).
    NotImage,
    /// Over `MAX_PREVIEW_BYTES`.
    TooBig,
    /// Gone, unreadable, not absolute, or not a regular file.
    Missing,
}

/// `path` as a `data:` URL, if it's an absolute path to a regular image file no
/// bigger than `MAX_PREVIEW_BYTES`. A symlink is followed only when it ends at
/// one; the extension is checked on both the link and its target.
pub fn data_url(path: &str) -> Result<String, PreviewError> {
    let asked = Path::new(path);
    if !asked.is_absolute() {
        return Err(PreviewError::Missing);
    }
    image_media_type(asked).ok_or(PreviewError::NotImage)?;
    let real = std::fs::canonicalize(asked).map_err(|_| PreviewError::Missing)?;
    let media = image_media_type(&real).ok_or(PreviewError::NotImage)?;
    let meta = std::fs::metadata(&real).map_err(|_| PreviewError::Missing)?;
    if !meta.is_file() {
        return Err(PreviewError::Missing);
    }
    if meta.len() > MAX_PREVIEW_BYTES {
        return Err(PreviewError::TooBig);
    }
    let bytes = std::fs::read(&real).map_err(|_| PreviewError::Missing)?;
    // The file could have grown between the check and the read.
    if bytes.len() as u64 > MAX_PREVIEW_BYTES {
        return Err(PreviewError::TooBig);
    }
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{media};base64,{data}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("trace-preview-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn an_image_becomes_a_data_url() {
        let dir = scratch();
        let png = dir.join("a.PNG");
        std::fs::write(&png, b"\x89PNG").unwrap();
        let url = data_url(&s(&png)).unwrap();
        assert_eq!(url, "data:image/png;base64,iVBORw==");
        let jpg = dir.join("b.jpeg");
        std::fs::write(&jpg, b"x").unwrap();
        assert!(data_url(&s(&jpg))
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_what_isnt_a_small_regular_image() {
        let dir = scratch();
        let txt = dir.join("notes.txt");
        std::fs::write(&txt, b"x").unwrap();
        assert_eq!(data_url(&s(&txt)), Err(PreviewError::NotImage));
        assert_eq!(
            data_url(&s(&dir.join("gone.png"))),
            Err(PreviewError::Missing)
        );
        assert_eq!(data_url("relative.png"), Err(PreviewError::Missing));
        let folder = dir.join("folder.png");
        std::fs::create_dir_all(&folder).unwrap();
        assert_eq!(data_url(&s(&folder)), Err(PreviewError::Missing));
        let big = dir.join("big.gif");
        let file = std::fs::File::create(&big).unwrap();
        file.set_len(MAX_PREVIEW_BYTES + 1).unwrap();
        assert_eq!(data_url(&s(&big)), Err(PreviewError::TooBig));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn follows_a_link_only_to_an_image() {
        let dir = scratch();
        let secret = dir.join("secret.txt");
        std::fs::write(&secret, b"x").unwrap();
        let disguised = dir.join("disguised.png");
        let real = dir.join("real.webp");
        std::fs::write(&real, b"x").unwrap();
        let link = dir.join("link.webp");
        let made = crate::platform::test_links::file(&secret, &disguised)
            && crate::platform::test_links::file(&real, &link);
        if !made {
            eprintln!("skipping: this machine can't make file symlinks");
            return;
        }
        assert_eq!(data_url(&s(&disguised)), Err(PreviewError::NotImage));
        assert!(data_url(&s(&link)).unwrap().starts_with("data:image/webp;"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
