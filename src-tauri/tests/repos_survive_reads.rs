#![allow(clippy::disallowed_methods)] // Outside the crate, so no platform::process.
//! A read during a save used to wipe the repo list. The old `load` treated a half-written
//! `repos.json` as a first run, rebuilt the list from the legacy `repo-path` file and saved
//! that over everything, so users kept losing all but one repo at launch.
//!
//! Its own test binary because it points `HOME` at a temp dir: `dirs::config_dir()` reads
//! it on each call, and this must never touch the real config dir.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use trace_lib::commands::repos;

fn git_repo(path: &Path) -> String {
    fs::create_dir_all(path).unwrap();
    let init = std::process::Command::new("git")
        .args(["init", "-q"])
        .current_dir(path)
        .status()
        .unwrap();
    assert!(init.success());
    path.to_str().unwrap().to_string()
}

#[test]
fn reads_during_saves_keep_every_repo() {
    let home = std::env::temp_dir().join(format!("trace-repos-{}", std::process::id()));
    fs::create_dir_all(&home).unwrap();
    std::env::set_var("HOME", &home);
    let config = dirs::config_dir().unwrap();
    assert!(
        config.starts_with(&home),
        "config dir escaped the temp HOME: {config:?}"
    );
    let dir = config.join("trace");
    fs::create_dir_all(&dir).unwrap();

    let legacy = git_repo(&home.join("legacy"));
    fs::write(dir.join("repo-path"), &legacy).unwrap();
    let mut want = vec![legacy];
    for i in 0..6 {
        let repo = git_repo(&home.join(format!("repo{i}")));
        repos::add_repo(repo.clone()).unwrap();
        want.push(repo);
    }
    assert_eq!(repos::list_repos().unwrap(), want);

    // Readers in the background, as the cleanup sweep and session polling are at launch.
    let stop = Arc::new(AtomicBool::new(false));
    let readers: Vec<_> = (0..8)
        .map(|_| {
            let stop = stop.clone();
            std::thread::spawn(move || {
                while !stop.load(Ordering::Relaxed) {
                    let _ = repos::issue_repo("ABC-1".to_string());
                }
            })
        })
        .collect();

    // The old code lost the list within a few of these. A failed save is fine here (the
    // lock can time out on a slow machine); losing repos isn't.
    let mut remaining = want.len();
    for i in 0..500 {
        let _ = repos::set_issue_repo(format!("T-{}", i % 20), want[1].clone());
        remaining = repos::list_repos().unwrap().len();
        if remaining < want.len() {
            break;
        }
    }
    stop.store(true, Ordering::Relaxed);
    for reader in readers {
        reader.join().unwrap();
    }
    let _ = fs::remove_dir_all(&home);
    assert_eq!(remaining, want.len(), "repos were wiped");
}
