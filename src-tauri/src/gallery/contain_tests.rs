use std::fs;

use super::*;
use crate::gallery::kinds::MAX_FILE_BYTES;
use crate::gallery::scan::tests::{set_of, Scratch};
use crate::gallery::store::Root;
use crate::platform::test_links;

fn s(p: &Path) -> String {
    p.to_string_lossy().into_owned()
}

#[test]
fn serves_only_images_inside_the_set() {
    let dir = Scratch::new("contain");
    let a = dir.file("pics/a.png", b"x");
    let txt = dir.file("pics/notes.txt", b"x");
    let deep = dir.file("pics/sub/b.png", b"x");
    let outside = dir.file("other/c.png", b"x");
    let pics = dir.0.join("pics");
    let flat = set_of(
        vec![Root {
            path: pics.clone(),
            folder: true,
        }],
        false,
        None,
    );
    assert!(image_path(&flat, &s(&a)).is_ok());
    assert_eq!(image_path(&flat, &s(&txt)).unwrap_err(), "Not an image.");
    assert!(image_path(&flat, &s(&deep))
        .unwrap_err()
        .contains("isn't in this set"));
    assert!(image_path(&flat, &s(&outside))
        .unwrap_err()
        .contains("isn't in this set"));
    let deep_set = set_of(
        vec![Root {
            path: pics.clone(),
            folder: true,
        }],
        true,
        None,
    );
    assert!(image_path(&deep_set, &s(&deep)).is_ok());
    // The folder itself, and relative paths, are never files of a set.
    assert!(image_path(&deep_set, &s(&pics)).is_err());
    assert_eq!(
        image_path(&deep_set, "pics/a.png").unwrap_err(),
        "Not an absolute path."
    );
}

#[test]
fn dot_dot_escapes_are_resolved_first() {
    let dir = Scratch::new("dotdot");
    dir.file("pics/a.png", b"x");
    dir.file("other/c.png", b"x");
    let set = set_of(
        vec![Root {
            path: dir.0.join("pics"),
            folder: true,
        }],
        true,
        None,
    );
    let sneaky = dir.0.join("pics").join("..").join("other").join("c.png");
    assert!(image_path(&set, &s(&sneaky))
        .unwrap_err()
        .contains("isn't in this set"));
    let fine = dir.0.join("pics").join("..").join("pics").join("a.png");
    assert!(image_path(&set, &s(&fine)).is_ok());
}

#[test]
fn named_files_admit_only_themselves() {
    let dir = Scratch::new("named");
    let a = dir.file("a.png", b"x");
    let b = dir.file("b.png", b"x");
    let set = set_of(
        vec![Root {
            path: a.clone(),
            folder: false,
        }],
        false,
        None,
    );
    assert!(image_path(&set, &s(&a)).is_ok());
    assert!(image_path(&set, &s(&b)).is_err());
}

#[test]
fn glob_and_size_cap_apply() {
    let dir = Scratch::new("globcap");
    let png = dir.file("a.png", b"x");
    let jpg = dir.file("b.jpg", b"x");
    let big = dir.0.join("big.png");
    fs::File::create(&big)
        .unwrap()
        .set_len(MAX_FILE_BYTES + 1)
        .unwrap();
    let set = set_of(
        vec![Root {
            path: dir.0.clone(),
            folder: true,
        }],
        false,
        Some("*.png"),
    );
    assert!(image_path(&set, &s(&png)).is_ok());
    assert!(image_path(&set, &s(&jpg)).is_err());
    assert!(image_path(&set, &s(&big)).unwrap_err().contains("size cap"));
}

#[test]
fn links_to_folders_outside_are_refused() {
    let outside = Scratch::new("contain-out-dir");
    outside.file("secret.png", b"x");
    let dir = Scratch::new("contain-dirlink");
    let linkdir = dir.0.join("linkdir");
    if !test_links::dir(&outside.0, &linkdir) {
        eprintln!("skipping: this machine can't link folders");
        return;
    }
    let set = set_of(
        vec![Root {
            path: dir.0.clone(),
            folder: true,
        }],
        true,
        None,
    );
    let through = linkdir.join("secret.png");
    assert!(through.exists());
    assert!(image_path(&set, &s(&through))
        .unwrap_err()
        .contains("isn't in this set"));
}

#[test]
fn symlinks_pointing_outside_are_refused() {
    let outside = Scratch::new("contain-out");
    let secret = outside.file("secret.png", b"x");
    let passwd = outside.file("passwd", b"x");
    let dir = Scratch::new("contain-links");
    let link = dir.0.join("link.png");
    let fake = dir.0.join("fake.png");
    if !(test_links::file(&secret, &link) && test_links::file(&passwd, &fake)) {
        eprintln!("skipping: this machine can't make file symlinks");
        return;
    }
    let set = set_of(
        vec![Root {
            path: dir.0.clone(),
            folder: true,
        }],
        true,
        None,
    );
    assert!(image_path(&set, &s(&link))
        .unwrap_err()
        .contains("isn't in this set"));
    // Named .png, but really a file without an image's name.
    assert_eq!(image_path(&set, &s(&fake)).unwrap_err(), "Not an image.");
}
