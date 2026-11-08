//! What the Gallery shows and how much: image types by extension (the only files it
//! will list or serve), and its caps.

use std::path::Path;

/// Largest file listed or served.
pub const MAX_FILE_BYTES: u64 = 25 * 1024 * 1024;
/// Most images in one set; past it the listing says it was cut.
pub const MAX_IMAGES: usize = 2000;
/// Folders or files one `show_images` call may name.
pub const MAX_INPUTS: usize = 50;
/// Directory entries one scan looks at, at most, so a huge tree can't stall it.
pub const MAX_VISITS: usize = 50_000;
/// How deep a recursive scan goes.
pub const MAX_DEPTH: usize = 12;

const KINDS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("svg", "image/svg+xml"),
    ("bmp", "image/bmp"),
    ("avif", "image/avif"),
];

/// "png, jpg, …", for messages.
pub fn listed() -> String {
    KINDS
        .iter()
        .map(|(ext, _)| *ext)
        .collect::<Vec<_>>()
        .join(", ")
}

/// The image's media type, from its extension; None for anything that isn't one.
pub fn mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    KINDS.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

pub fn is_svg(path: &Path) -> bool {
    mime_for(path) == Some("image/svg+xml")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_image_extensions() {
        for name in [
            "a.png", "b.JPG", "c.jpeg", "d.gif", "e.webp", "f.svg", "g.BMP", "h.avif",
        ] {
            assert!(mime_for(Path::new(name)).is_some(), "{name}");
        }
        for name in [
            "a.txt",
            "b.html",
            "c.svg.txt",
            "d",
            ".png",
            "e.pngx",
            "f.exe",
            "g.js",
            "h.ico",
            "i.tiff",
        ] {
            assert!(mime_for(Path::new(name)).is_none(), "{name}");
        }
        assert!(is_svg(Path::new("x.SVG")));
        assert_eq!(mime_for(Path::new("x.jpg")), Some("image/jpeg"));
    }
}
