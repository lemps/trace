use std::fs;
use std::path::PathBuf;

use super::*;
use crate::gallery::kinds::MAX_FILE_BYTES;
use crate::gallery::store::GallerySet;

/// A fresh folder for one test, removed when dropped.
pub(crate) struct Scratch(pub PathBuf);

impl Scratch {
    pub(crate) fn new(name: &str) -> Scratch {
        let dir =
            std::env::temp_dir().join(format!("trace-gallery-{name}-{}", crate::helpers::new_id()));
        fs::create_dir_all(&dir).unwrap();
        Scratch(fs::canonicalize(&dir).unwrap())
    }

    pub(crate) fn file(&self, rel: &str, bytes: &[u8]) -> PathBuf {
        let path = self.0.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) fn set_of(roots: Vec<Root>, recursive: bool, glob: Option<&str>) -> GallerySet {
    GallerySet {
        id: "s1".into(),
        title: "t".into(),
        roots,
        recursive,
        glob: glob.map(|g| crate::gallery::glob::Glob::new(g).unwrap()),
        created_at: 0,
    }
}

fn names(listing: &Listing) -> Vec<&str> {
    listing.images.iter().map(|i| i.rel.as_str()).collect()
}

#[test]
fn resolve_takes_absolute_and_relative_paths() {
    let s = Scratch::new("resolve");
    s.file("shots/a.png", b"x");
    let roots = resolve(&["shots".into()], Some(&s.0)).unwrap();
    assert_eq!(
        roots,
        vec![Root {
            path: s.0.join("shots"),
            folder: true
        }]
    );
    let abs = s.0.join("shots").join("a.png");
    let roots = resolve(&[abs.to_string_lossy().into_owned()], None).unwrap();
    assert!(!roots[0].folder);
    // `..` resolves: the root is where the folder really is.
    let roots = resolve(&["shots/../shots".into()], Some(&s.0)).unwrap();
    assert_eq!(roots[0].path, s.0.join("shots"));
}

#[test]
fn resolve_says_what_is_wrong() {
    let s = Scratch::new("resolve-bad");
    s.file("notes.txt", b"x");
    assert!(resolve(&[], Some(&s.0))
        .unwrap_err()
        .contains("Name a folder"));
    assert!(resolve(&["missing".into()], Some(&s.0))
        .unwrap_err()
        .contains("There's no folder"));
    assert!(resolve(&["notes.txt".into()], Some(&s.0))
        .unwrap_err()
        .contains("isn't an image"));
    assert!(resolve(&["rel".into()], None)
        .unwrap_err()
        .contains("absolute path"));
    let many: Vec<String> = (0..60).map(|i| format!("{i}")).collect();
    assert!(resolve(&many, Some(&s.0)).unwrap_err().contains("at most"));
}

#[test]
fn lists_only_images_under_the_cap() {
    let s = Scratch::new("list");
    s.file("a.png", b"png");
    s.file("b.SVG", b"<svg/>");
    s.file("c.txt", b"text");
    s.file("d.html", b"<html>");
    s.file("e.jpg.exe", b"x");
    s.file("sub/f.webp", b"x");
    let big = s.0.join("big.png");
    fs::File::create(&big)
        .unwrap()
        .set_len(MAX_FILE_BYTES + 1)
        .unwrap();
    let set = set_of(
        vec![Root {
            path: s.0.clone(),
            folder: true,
        }],
        false,
        None,
    );
    let listing = list(&set);
    assert_eq!(names(&listing), ["a.png", "b.SVG"]);
    assert_eq!(listing.too_large, 1);
    let set = set_of(
        vec![Root {
            path: s.0.clone(),
            folder: true,
        }],
        true,
        None,
    );
    assert_eq!(names(&list(&set)), ["a.png", "b.SVG", "sub/f.webp"]);
}

#[test]
fn glob_filters_folders_but_not_named_files() {
    let s = Scratch::new("glob");
    s.file("a.png", b"x");
    let b = s.file("b.jpg", b"x");
    s.file("deep/c.png", b"x");
    let set = set_of(
        vec![
            Root {
                path: s.0.clone(),
                folder: true,
            },
            Root {
                path: b.clone(),
                folder: false,
            },
        ],
        true,
        Some("*.png"),
    );
    assert_eq!(names(&list(&set)), ["a.png", "deep/c.png", "b.jpg"]);
}

#[test]
fn the_image_cap_truncates() {
    let s = Scratch::new("cap");
    for i in 0..(crate::gallery::kinds::MAX_IMAGES + 5) {
        s.file(&format!("{i:05}.png"), b"x");
    }
    let set = set_of(
        vec![Root {
            path: s.0.clone(),
            folder: true,
        }],
        false,
        None,
    );
    let listing = list(&set);
    assert_eq!(listing.images.len(), crate::gallery::kinds::MAX_IMAGES);
    assert!(listing.truncated);
}

#[test]
fn missing_roots_are_reported() {
    let s = Scratch::new("missing");
    let gone = s.0.join("gone");
    let set = set_of(
        vec![Root {
            path: gone,
            folder: true,
        }],
        false,
        None,
    );
    assert_eq!(list(&set).missing.len(), 1);
}

#[test]
fn folders_linked_from_outside_are_never_walked() {
    let outside = Scratch::new("outside-dir");
    outside.file("secret.png", b"x");
    let s = Scratch::new("dirlinks");
    s.file("ok.png", b"x");
    if !crate::platform::test_links::dir(&outside.0, &s.0.join("linkdir")) {
        eprintln!("skipping: this machine can't link folders");
        return;
    }
    let set = set_of(
        vec![Root {
            path: s.0.clone(),
            folder: true,
        }],
        true,
        None,
    );
    assert_eq!(names(&list(&set)), ["ok.png"]);
}

#[test]
fn links_out_of_the_root_are_never_listed() {
    let outside = Scratch::new("outside");
    let secret = outside.file("secret.png", b"x");
    let text = outside.file("passwd", b"x");
    let s = Scratch::new("links");
    s.file("ok.png", b"x");
    let inner = s.file("in/x.png", b"x");
    let made = crate::platform::test_links::file(&secret, &s.0.join("link.png"))
        && crate::platform::test_links::file(&text, &s.0.join("fake.png"))
        && crate::platform::test_links::file(&inner, &s.0.join("in-link.png"));
    if !made {
        eprintln!("skipping: this machine can't make file symlinks");
        return;
    }
    let set = set_of(
        vec![Root {
            path: s.0.clone(),
            folder: true,
        }],
        true,
        None,
    );
    let listed = list(&set);
    assert!(listed
        .images
        .iter()
        .all(|i| !i.path.contains("secret") && !i.path.contains("passwd")));
    // A link to a file already in the set lists it once.
    assert_eq!(names(&listed), ["in/x.png", "ok.png"]);
}
