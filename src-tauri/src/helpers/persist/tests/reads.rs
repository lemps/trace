use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::super::{quarantine, read_json, read_or_default, read_or_log, update, Style};
use super::{chmod, mode, Counts, TempDir};

fn running_as_root() -> bool {
    // SAFETY: `geteuid` takes nothing and can't fail.
    unsafe { libc::geteuid() == 0 }
}

/// The one `*.corrupt-*` file in the dir.
fn quarantined(dir: &TempDir) -> PathBuf {
    let found: Vec<String> = dir
        .names()
        .into_iter()
        .filter(|n| n.starts_with("state.json.corrupt-"))
        .collect();
    assert_eq!(found.len(), 1, "expected one quarantined file: {found:?}");
    dir.file(&found[0])
}

#[test]
fn a_missing_file_is_the_default_and_creates_nothing() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    assert!(read_json::<Counts>(&path).unwrap().is_none());
    assert!(read_or_default::<Counts>(&path).unwrap().is_empty());
    assert_eq!(dir.names(), Vec::<String>::new());
}

#[test]
fn reads_a_file_written_by_plain_fs_write() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::write(&path, r#"{"a":1}"#).unwrap();
    assert_eq!(read_or_default::<Counts>(&path).unwrap()["a"], 1);
}

#[test]
fn corrupt_files_are_quarantined_with_their_bytes_intact() {
    let cases: [&[u8]; 4] = [b"{\"a\":1", b"not json", b"", &[0xff, 0xfe, 0x00, 0x7b]];
    for bytes in cases {
        let dir = TempDir::new();
        let path = dir.file("state.json");
        fs::write(&path, bytes).unwrap();
        chmod(&path, 0o644);
        assert!(read_json::<Counts>(&path).unwrap().is_none());
        assert!(!path.exists());
        let aside = quarantined(&dir);
        assert_eq!(fs::read(&aside).unwrap(), bytes);
        assert_eq!(mode(&aside), 0o600, "a quarantined file may hold a token");
    }
}

#[test]
fn an_update_over_a_corrupt_file_starts_fresh_and_keeps_the_old_bytes() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::write(&path, b"{\"a\":1").unwrap();
    update(&path, Style::Compact, |c: &mut Counts| {
        c.insert("b".to_string(), 2);
    })
    .unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"b":2}"#);
    assert_eq!(fs::read(quarantined(&dir)).unwrap(), b"{\"a\":1");
}

#[test]
fn quarantine_never_overwrites_an_earlier_one() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    for bytes in [b"bad1", b"bad2", b"bad3"] {
        fs::write(&path, bytes).unwrap();
        quarantine(&path).unwrap();
    }
    let mut kept: Vec<Vec<u8>> = dir
        .names()
        .iter()
        .map(|n| fs::read(dir.file(n)).unwrap())
        .collect();
    kept.sort();
    assert_eq!(kept, [b"bad1", b"bad2", b"bad3"]);
}

#[test]
fn a_write_in_progress_by_an_older_trace_is_not_called_corrupt() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    // Just what an older trace's `fs::write` looks like from outside, mid-write.
    fs::write(&path, b"{\"a\":").unwrap();
    let writer = {
        let path = path.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(20));
            fs::write(&path, br#"{"a":1}"#).unwrap();
        })
    };
    let read = read_or_default::<Counts>(&path).unwrap();
    writer.join().unwrap();
    assert_eq!(read["a"], 1);
    assert!(!dir.names().iter().any(|n| n.contains("corrupt")));
}

#[test]
fn a_permission_error_never_leads_to_an_overwrite() {
    if running_as_root() {
        eprintln!("skipped: root ignores file permissions");
        return;
    }
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::write(&path, br#"{"a":1}"#).unwrap();
    chmod(&path, 0o000);

    assert!(read_json::<Counts>(&path).is_err());
    assert!(read_or_log::<Counts>(&path).is_empty());
    let mut ran = false;
    let result = update(&path, Style::Compact, |c: &mut Counts| {
        ran = true;
        c.clear();
    });

    chmod(&path, 0o600);
    assert!(result.is_err());
    assert!(!ran, "the closure must not see a made-up empty value");
    assert_eq!(fs::read(&path).unwrap(), br#"{"a":1}"#);
    assert_eq!(dir.names(), ["state.json", "state.json.lock"]);
}

#[test]
fn any_other_read_error_never_leads_to_an_overwrite() {
    // Works as root too: reading a directory fails whoever you are.
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("keep"), b"kept").unwrap();
    let result = update(&path, Style::Compact, |c: &mut Counts| {
        c.insert("a".to_string(), 1);
    });
    assert!(result.is_err());
    assert_eq!(fs::read(path.join("keep")).unwrap(), b"kept");
}

#[test]
fn json_of_an_unknown_shape_is_left_alone_and_its_contents_stay_out_of_the_error() {
    #[derive(Deserialize, Serialize, Default)]
    struct Stored {
        count: u32,
    }
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let bytes = br#"{"count":"hunter2"}"#;
    fs::write(&path, bytes).unwrap();

    let err = read_json::<Stored>(&path).err().expect("should refuse");
    assert!(!err.contains("hunter2"), "leaked file contents: {err}");
    assert!(update(&path, Style::Compact, |s: &mut Stored| s.count = 1).is_err());

    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(dir.names(), ["state.json", "state.json.lock"]);
}
