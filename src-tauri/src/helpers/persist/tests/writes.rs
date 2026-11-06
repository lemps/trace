use std::fs;

use super::super::atomic::TempFile;
use super::super::{update, write_atomic, write_json, LoadGate, Style};
use super::{chmod, mode, Counts, TempDir};

#[test]
fn atomic_replace_leaves_only_the_target() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    write_atomic(&path, b"first").unwrap();
    write_atomic(&path, b"second").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"second");
    assert_eq!(dir.names(), ["state.json"]);
}

#[test]
fn a_failed_write_cleans_up_and_keeps_what_was_there() {
    let dir = TempDir::new();
    // A non-empty directory can't be renamed over, so the rename itself fails.
    let path = dir.file("state.json");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("keep"), b"kept").unwrap();
    assert!(write_atomic(&path, b"new").is_err());
    assert_eq!(dir.names(), ["state.json"]);
    assert_eq!(fs::read(path.join("keep")).unwrap(), b"kept");
}

#[test]
fn creates_missing_parent_directories() {
    let dir = TempDir::new();
    let path = dir.file("a/b/state.json");
    write_atomic(&path, b"x").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"x");
}

#[test]
fn a_secret_is_owner_only_from_creation() {
    let dir = TempDir::new();
    let path = dir.file("key");
    // The temp file holds the bytes before the rename, so it's the one that matters.
    let tmp = TempFile::create(&path).unwrap();
    assert_eq!(mode(&tmp.path), 0o600);
    drop(tmp);
    assert_eq!(dir.names(), Vec::<String>::new());

    write_atomic(&path, b"secret").unwrap();
    assert_eq!(mode(&path), 0o600);
}

#[test]
fn rewriting_tightens_a_file_left_with_wrong_permissions() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::write(&path, b"{}").unwrap();
    chmod(&path, 0o644);
    write_atomic(&path, b"{}").unwrap();
    assert_eq!(mode(&path), 0o600);

    // An update that changes nothing skips the write but still tightens.
    chmod(&path, 0o644);
    update(&path, Style::Compact, |_: &mut Counts| ()).unwrap();
    assert_eq!(mode(&path), 0o600);
}

#[test]
fn writes_through_a_symlink_rather_than_replacing_it() {
    let dir = TempDir::new();
    let real = dir.file("real.json");
    let link = dir.file("link.json");
    fs::write(&real, b"old").unwrap();
    std::os::unix::fs::symlink(&real, &link).unwrap();
    write_atomic(&link, b"new").unwrap();
    assert!(fs::symlink_metadata(&link)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(&real).unwrap(), b"new");
}

#[test]
fn on_disk_bytes_are_plain_json_in_each_style() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let value: Counts = [("a".to_string(), 1)].into_iter().collect();
    write_json(&path, Style::Compact, &value).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"a":1}"#);
    write_json(&path, Style::Pretty, &value).unwrap();
    assert_eq!(
        fs::read_to_string(&path).unwrap(),
        serde_json::to_string_pretty(&value).unwrap()
    );
}

#[test]
fn saves_are_refused_from_a_failed_load_until_one_succeeds() {
    let gate = LoadGate::new();
    assert!(gate.check().is_ok());
    assert!(gate.observe::<()>(Err("read failed".to_string())).is_err());
    assert!(gate.check().is_err());
    assert!(gate.observe(Ok(())).is_ok());
    assert!(gate.check().is_ok());
}
