//! Running a repo's [`SetupConfig`] in a worktree trace just created.
//!
//! Worktrees are created on whatever thread starts an agent, session or scheduled
//! run, and an install can take minutes, so setup runs on its own thread. An
//! interactive agent starts beside it (its start is a sync command on the main
//! thread, which can't block for an install); a scheduled run, unattended and on
//! its own thread, waits for it with [`wait_for`]. Progress goes to the renderer
//! as `worktree-setup` events (a toast), so a failed `npm ci` is seen rather than
//! discovered by the agent.

use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::model::{is_inside_relative, SetupConfig};
use crate::platform::ports::AgentEnvironment;
use crate::platform::Os;

/// The backend → renderer event for setup progress.
pub const EVENT: &str = "worktree-setup";

/// How much of a failed command's output the event carries.
const OUTPUT_TAIL: usize = 1500;

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Worktrees whose setup is still running, and the signal when one finishes.
static PENDING: Mutex<Vec<String>> = Mutex::new(Vec::new());
static SETTLED: Condvar = Condvar::new();

fn pending() -> std::sync::MutexGuard<'static, Vec<String>> {
    PENDING.lock().unwrap_or_else(|p| p.into_inner())
}

/// Block until `worktree`'s setup (if any is running) finishes, or `timeout`
/// passes. True when nothing is left running for it.
pub fn wait_for(worktree: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let mut guard = pending();
    while guard.iter().any(|w| w == worktree) {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return false;
        }
        guard = SETTLED
            .wait_timeout(guard, left)
            .unwrap_or_else(|p| p.into_inner())
            .0;
    }
    true
}

/// Give setup a handle to emit through. Called once from `run()`'s setup.
pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

/// One step of a setup, as the renderer sees it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SetupEvent {
    pub repo: String,
    pub worktree: String,
    /// "running" | "done" | "failed".
    pub state: &'static str,
    /// failed: the command or copy that failed.
    pub step: Option<String>,
    /// failed: the end of its output, or the error.
    pub output: Option<String>,
}

/// Why a setup stopped.
#[derive(Debug, PartialEq)]
pub struct StepFailure {
    pub step: String,
    pub output: String,
}

/// Start the setup of `repo` for the worktree just created at `worktree`, if it
/// has one. Returns at once; the work is on a thread.
pub fn after_worktree_created(repo: &str, worktree: &str) {
    let Some(setup) = super::store::load()
        .for_path(repo)
        .map(|r| r.setup.clone())
        .filter(|s| !s.is_empty())
    else {
        return;
    };
    let (repo, worktree) = (repo.to_string(), worktree.to_string());
    // Marked before the thread starts, so a `wait_for` right after can't miss it.
    pending().push(worktree.clone());
    std::thread::spawn(move || {
        emit(&repo, &worktree, "running", None);
        let env = crate::claude::env::build_effective_cli_env(&HashMap::new());
        match run_steps(Path::new(&repo), Path::new(&worktree), &setup, &env) {
            Ok(()) => emit(&repo, &worktree, "done", None),
            Err(failure) => emit(&repo, &worktree, "failed", Some(failure)),
        }
        pending().retain(|w| w != &worktree);
        SETTLED.notify_all();
    });
}

fn emit(repo: &str, worktree: &str, state: &'static str, failure: Option<StepFailure>) {
    let Some(app) = APP.get() else {
        return;
    };
    let (step, output) = failure.map(|f| (f.step, f.output)).unzip();
    let event = SetupEvent {
        repo: repo.to_string(),
        worktree: worktree.to_string(),
        state,
        step,
        output,
    };
    let _ = app.emit(EVENT, &event);
}

/// Copy the files, then run the commands with `env` laid over trace's own (not
/// replacing it: `platform::process` has already set per-OS variables on the
/// command, like Windows' `core.longpaths` for git), stopping at the first
/// failure. A file the main checkout doesn't have is skipped (a `.env` the user
/// hasn't made yet), and one the worktree already has is left alone.
pub fn run_steps(
    repo: &Path,
    worktree: &Path,
    setup: &SetupConfig,
    env: &HashMap<String, String>,
) -> Result<(), StepFailure> {
    for file in &setup.copy_files {
        let fail = |e: std::io::Error| StepFailure {
            step: format!("copy {file}"),
            output: e.to_string(),
        };
        if !is_inside_relative(file) {
            return Err(fail(std::io::Error::other("path leaves the repository")));
        }
        let (from, to) = (repo.join(file), worktree.join(file));
        if !from.is_file() || to.exists() {
            continue;
        }
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent).map_err(fail)?;
        }
        std::fs::copy(&from, &to).map_err(fail)?;
    }
    for line in &setup.commands {
        let out = Os::shell_line(line)
            .current_dir(worktree)
            .envs(env)
            .stdin(Stdio::null())
            .output()
            .map_err(|e| StepFailure {
                step: line.clone(),
                output: e.to_string(),
            })?;
        if !out.status.success() {
            let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
            text.push_str(&String::from_utf8_lossy(&out.stderr));
            return Err(StepFailure {
                step: line.clone(),
                output: tail(text.trim(), OUTPUT_TAIL),
            });
        }
    }
    Ok(())
}

/// The last `max` chars of `text`, on a char boundary.
fn tail(text: &str, max: usize) -> String {
    let count = text.chars().count();
    text.chars().skip(count.saturating_sub(max)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("trace-setup-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn env() -> HashMap<String, String> {
        std::env::vars().collect()
    }

    #[test]
    fn copies_missing_files_and_keeps_existing_ones() {
        let (repo, wt) = (scratch("repo"), scratch("wt"));
        std::fs::write(repo.join(".env"), "A=1").unwrap();
        std::fs::create_dir_all(repo.join("cfg")).unwrap();
        std::fs::write(repo.join("cfg/local.json"), "{}").unwrap();
        std::fs::write(wt.join("keep.txt"), "mine").unwrap();
        std::fs::write(repo.join("keep.txt"), "theirs").unwrap();
        let setup = SetupConfig {
            copy_files: vec![
                ".env".into(),
                "cfg/local.json".into(),
                "keep.txt".into(),
                "nope".into(),
            ],
            commands: vec![],
        };
        assert_eq!(run_steps(&repo, &wt, &setup, &env()), Ok(()));
        assert_eq!(std::fs::read_to_string(wt.join(".env")).unwrap(), "A=1");
        assert!(wt.join("cfg/local.json").is_file());
        assert_eq!(
            std::fs::read_to_string(wt.join("keep.txt")).unwrap(),
            "mine"
        );
        assert!(!wt.join("nope").exists());
    }

    #[test]
    fn runs_commands_in_the_worktree_and_stops_at_the_first_failure() {
        let (repo, wt) = (scratch("repo2"), scratch("wt2"));
        let setup = SetupConfig {
            copy_files: vec![],
            commands: vec![
                "echo made > made.txt".into(),
                "echo boom && exit 3".into(),
                "echo never > never.txt".into(),
            ],
        };
        let err = run_steps(&repo, &wt, &setup, &env()).unwrap_err();
        assert_eq!(err.step, "echo boom && exit 3");
        assert!(err.output.contains("boom"));
        assert!(wt.join("made.txt").is_file(), "ran in the worktree");
        assert!(!wt.join("never.txt").exists(), "stopped after the failure");
    }

    #[test]
    fn a_line_with_quotes_reaches_the_shell_intact() {
        let (repo, wt) = (scratch("repo3"), scratch("wt3"));
        let setup = SetupConfig {
            copy_files: vec![],
            commands: vec![r#"git -c "core.quotePath=false" --version > "v x.txt""#.into()],
        };
        assert_eq!(run_steps(&repo, &wt, &setup, &env()), Ok(()));
        assert!(wt.join("v x.txt").is_file());
    }

    #[test]
    fn wait_for_returns_once_setup_settles() {
        let wt = "wait-for-test-worktree";
        assert!(wait_for(wt, Duration::ZERO), "nothing running");
        pending().push(wt.to_string());
        assert!(
            !wait_for(wt, Duration::from_millis(20)),
            "times out while running"
        );
        let done = std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(30));
            pending().retain(|w| w != "wait-for-test-worktree");
            SETTLED.notify_all();
        });
        assert!(wait_for(wt, Duration::from_secs(5)));
        done.join().unwrap();
    }

    /// The per-OS variables `platform::process` sets survive the setup's env: a setup
    /// command's git sees what trace's own git does (Windows' `core.longpaths=true`,
    /// nothing elsewhere), with no OS check here.
    #[test]
    fn keeps_the_platform_env() {
        let (repo, wt) = (scratch("repo4"), scratch("wt4"));
        let setup = SetupConfig {
            copy_files: vec![],
            commands: vec!["git config core.longpaths > lp.txt".into()],
        };
        let _ = run_steps(&repo, &wt, &setup, &HashMap::new());
        let expected = crate::claude::discovery::command("git")
            .args(["config", "core.longpaths"])
            .current_dir(&wt)
            .output()
            .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
            .unwrap_or_default();
        let lp = std::fs::read_to_string(wt.join("lp.txt")).unwrap_or_default();
        assert_eq!(lp.trim(), expected, "core.longpaths reached git");
    }

    #[test]
    fn tail_keeps_the_end() {
        assert_eq!(tail("abcdef", 3), "def");
        assert_eq!(tail("ab", 3), "ab");
        assert_eq!(tail("ééé", 2), "éé");
    }
}
