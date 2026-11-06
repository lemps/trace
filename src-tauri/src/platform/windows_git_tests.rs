//! Which git trace picks on Windows, run on real Windows by CI. Split from
//! `windows_tests` to keep that file small.

use std::fs;
use std::path::PathBuf;

use super::*;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("trace-{name}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn a_git_built_on_msys2_or_cygwin_is_not_used() {
    let dir = temp_dir("posix-git");
    let git = dir.join("git.exe");
    fs::write(&git, "").unwrap();
    assert!(<Os as ToolLocator>::is_usable("git", &git));
    for runtime in ["msys-2.0.dll", "cygwin1.dll"] {
        fs::write(dir.join(runtime), "").unwrap();
        assert!(!<Os as ToolLocator>::is_usable("git", &git), "{runtime}");
        // Git Bash is an MSYS2 build too, and the hooks need it.
        assert!(<Os as ToolLocator>::is_usable(
            "bash",
            &dir.join("bash.exe")
        ));
        fs::remove_file(dir.join(runtime)).unwrap();
    }
    fs::remove_dir_all(&dir).unwrap();
}

/// The git trace finds writes a worktree's `.git` file that Git for Windows can follow,
/// even with an MSYS2 git earlier on `PATH` (devkitPro puts one first).
#[test]
fn a_worktree_made_with_the_found_git_points_at_a_windows_path() {
    let git = crate::claude::discovery::find_cli_with_env("git", None).expect("git is installed");
    let repo = temp_dir("wt-pointer");
    let run = |args: &[&str]| {
        let out = process::command(&git)
            .current_dir(&repo)
            .args(args)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    };
    run(&["init", "-q"]);
    run(&[
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.invalid",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "init",
    ]);
    run(&["worktree", "add", "-q", "wt"]);
    let pointer = fs::read_to_string(repo.join("wt").join(".git")).unwrap();
    let target = pointer.trim().trim_start_matches("gitdir: ");
    assert!(target.chars().nth(1) == Some(':'), "{git} wrote {pointer}");
    fs::remove_dir_all(&repo).unwrap();
}
