use std::fs::{self, File};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use super::super::lock::FileLock;
use super::super::{read_json, read_or_default, sibling, update, update_or, Style};
use super::{Counts, TempDir};

fn bump(path: &Path) {
    update(path, Style::Compact, |c: &mut Counts| {
        *c.entry("n".to_string()).or_default() += 1;
    })
    .unwrap();
}

#[test]
fn an_update_that_changes_nothing_writes_nothing() {
    use std::os::unix::fs::MetadataExt;
    let dir = TempDir::new();
    let path = dir.file("state.json");
    bump(&path);
    let inode = fs::metadata(&path).unwrap().ino();
    update(&path, Style::Compact, |_: &mut Counts| ()).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
    // Nor does a no-op on a missing file bring one into existence.
    let other = dir.file("other.json");
    update(&other, Style::Compact, |_: &mut Counts| ()).unwrap();
    assert!(!other.exists());
}

#[test]
fn update_or_seeds_only_a_missing_file() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let seed = || -> Counts { [("seed".to_string(), 1)].into_iter().collect() };
    let add = |c: &mut Counts| {
        c.insert("added".to_string(), 1);
        c.len()
    };
    assert_eq!(update_or(&path, Style::Compact, seed, add).unwrap(), 2);
    fs::write(&path, r#"{"a":1}"#).unwrap();
    assert_eq!(update_or(&path, Style::Compact, seed, add).unwrap(), 2);
    assert!(!read_or_default::<Counts>(&path)
        .unwrap()
        .contains_key("seed"));
}

#[test]
fn concurrent_updates_from_many_threads_all_land() {
    const THREADS: u32 = 8;
    const EACH: u32 = 10;
    let dir = TempDir::new();
    let path = dir.file("state.json");
    std::thread::scope(|s| {
        for _ in 0..THREADS {
            s.spawn(|| {
                for _ in 0..EACH {
                    bump(&path);
                }
            });
        }
    });
    let counts: Counts = read_or_default(&path).unwrap();
    assert_eq!(counts["n"], THREADS * EACH);
    assert_eq!(dir.names(), ["state.json", "state.json.lock"]);
}

const CHILD_FILE: &str = "TRACE_PERSIST_TEST_FILE";
const CHILD_UPDATES: u32 = 10;

/// Not a test of its own: `updates_from_real_processes_all_land` re-runs this test
/// binary with this as the only test, and a plain run does nothing here.
#[test]
fn child_process_updater() {
    if let Some(path) = std::env::var_os(CHILD_FILE) {
        for _ in 0..CHILD_UPDATES {
            bump(Path::new(&path));
        }
    }
}

#[test]
fn updates_from_real_processes_all_land() {
    const CHILDREN: u32 = 3;
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let children: Vec<_> = (0..CHILDREN)
        .map(|_| {
            Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "helpers::persist::tests::updates::child_process_updater",
                ])
                .env(CHILD_FILE, &path)
                .stdout(Stdio::null())
                .spawn()
                .unwrap()
        })
        .collect();
    for _ in 0..CHILD_UPDATES {
        bump(&path);
    }
    for mut child in children {
        assert!(child.wait().unwrap().success());
    }
    // The total also proves the children ran: a filter matching nothing exits 0.
    let counts: Counts = read_or_default(&path).unwrap();
    assert_eq!(counts["n"], (CHILDREN + 1) * CHILD_UPDATES);
}

#[test]
fn a_nested_update_errors_instead_of_deadlocking() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let other = dir.file("other.json");
    let (done_tx, done_rx) = mpsc::channel();
    let (same, different) = (path.clone(), other.clone());
    std::thread::spawn(move || {
        let nested = update(&same, Style::Compact, |c: &mut Counts| {
            c.insert("outer".to_string(), 1);
            (
                update(&same, Style::Compact, |_: &mut Counts| ()),
                update(&different, Style::Compact, |_: &mut Counts| ()),
            )
        });
        done_tx.send(nested).unwrap();
    });
    let (same_file, other_file) = done_rx
        .recv_timeout(Duration::from_secs(5))
        .expect("nested update deadlocked")
        .unwrap();
    assert!(same_file.is_err());
    assert!(other_file.is_err());
    // The outer update isn't harmed, and the lock is free again afterwards.
    assert_eq!(read_or_default::<Counts>(&path).unwrap()["outer"], 1);
    bump(&path);
    assert!(!other.exists());
}

#[test]
fn reading_the_same_corrupt_file_inside_its_update_does_not_deadlock() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let (done_tx, done_rx) = mpsc::channel();
    let inner = path.clone();
    std::thread::spawn(move || {
        let result = update(&inner, Style::Compact, |_: &mut Counts| {
            fs::write(&inner, b"garbage").unwrap();
            read_json::<Counts>(&inner).map(|v| v.is_none())
        });
        done_tx.send(result).unwrap();
    });
    let result = done_rx
        .recv_timeout(Duration::from_secs(5))
        .expect("read inside an update deadlocked");
    assert_eq!(result.unwrap(), Ok(true));
}

#[test]
fn a_panicking_closure_releases_the_lock_and_leaves_the_file() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    fs::write(&path, r#"{"a":1}"#).unwrap();
    let panicked = std::panic::catch_unwind(|| {
        let _ = update(&path, Style::Compact, |c: &mut Counts| {
            c.clear();
            panic!("expected: testing lock release");
        });
    });
    assert!(panicked.is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"a":1}"#);
    bump(&path);
    assert_eq!(read_or_default::<Counts>(&path).unwrap()["n"], 1);
}

#[test]
fn a_stuck_lock_holder_times_out_with_an_error() {
    let dir = TempDir::new();
    let path = dir.file("state.json");
    let held = File::create(sibling(&path, ".lock")).unwrap();
    held.lock().unwrap();
    let err = FileLock::acquire_within(&path, Duration::from_millis(50))
        .err()
        .expect("should time out");
    assert!(err.contains("Timed out"), "{err}");
    drop(held);
    assert!(FileLock::acquire_within(&path, Duration::from_millis(50)).is_ok());
}
