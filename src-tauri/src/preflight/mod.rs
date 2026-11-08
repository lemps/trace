//! Preflight: is this computer ready for trace? `git` and `claude` must be
//! installed, and `gh` installed and signed in (PR watching needs it); `codex` is
//! listed as optional. The first run shows the list, and a later launch raises a
//! quiet notice when a required check fails.
//!
//! Tools are found the way trace finds them to run them (`claude::discovery`), so
//! a check never passes for a binary an agent then can't start. Each group runs
//! on its own thread and the whole list is back within [`DEADLINE`]: `claude` is
//! looked up on the login shell's `PATH`, and a slow shell profile mustn't hold up
//! the window.

pub mod checks;

use std::collections::HashMap;
use std::process::{Command, Output, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::build_effective_cli_env;
use crate::platform::install_hints::Tool;
use checks::{gh_check, timed_out, tool_check, Check, GhAuth};

/// The longest the whole list may take.
const DEADLINE: Duration = Duration::from_secs(12);

/// The longest `gh auth status` may run. It can reach the network to check a token.
const GH_TIMEOUT: Duration = Duration::from_secs(8);

/// How often a running `gh` is polled for exit.
const POLL: Duration = Duration::from_millis(25);

/// The checks in display order: (id, name, required). A group that doesn't
/// report before the deadline is shown as "couldn't check" in its place.
const ORDER: [(&str, &str, bool); 4] = [
    ("git", "Git", true),
    ("claude", "Claude Code", true),
    ("gh", "GitHub CLI", true),
    ("codex", "Codex", false),
];

/// Run every check, in parallel, and return them in [`ORDER`]. Blocking: call it
/// off the main thread.
pub fn run() -> Vec<Check> {
    let (tx, rx) = mpsc::channel::<Vec<Check>>();
    let spawn = |job: fn() -> Vec<Check>| {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(job());
        });
    };
    spawn(|| vec![tool_check("git", Tool::Git, "Git", true, find("git", None))]);
    spawn(agent_clis);
    spawn(|| vec![gh()]);
    drop(tx);

    let deadline = Instant::now() + DEADLINE;
    let mut found: HashMap<&'static str, Check> = HashMap::new();
    while found.len() < ORDER.len() {
        let left = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(left) {
            Ok(batch) => found.extend(batch.into_iter().map(|c| (c.id, c))),
            Err(_) => break,
        }
    }
    ORDER
        .iter()
        .map(|&(id, name, required)| {
            found
                .remove(id)
                .unwrap_or_else(|| timed_out(id, name, required))
        })
        .collect()
}

fn find(name: &str, env: Option<&HashMap<String, String>>) -> Option<String> {
    find_cli_with_env(name, env)
}

/// `claude` and `codex`, looked up in the environment agents are spawned with
/// (`claude::pty`), which includes the login shell's `PATH` (npm, nvm installs).
fn agent_clis() -> Vec<Check> {
    let env = build_effective_cli_env(&HashMap::new());
    vec![
        tool_check(
            "claude",
            Tool::Claude,
            "Claude Code",
            true,
            find("claude", Some(&env)),
        ),
        tool_check(
            "codex",
            Tool::Codex,
            "Codex",
            false,
            find("codex", Some(&env)),
        ),
    ]
}

/// `gh`: installed, then signed in.
fn gh() -> Check {
    let Some(path) = find("gh", None) else {
        return gh_check(None, GhAuth::SignedOut);
    };
    let mut cmd = crate::platform::process::command(&path);
    cmd.args(["auth", "status", "--json", "hosts"]);
    let auth = match output_within(cmd, GH_TIMEOUT) {
        Ok(out) => {
            checks::gh_auth_from(&String::from_utf8_lossy(&out.stdout), out.status.success())
        }
        Err(why) => GhAuth::Unknown(why),
    };
    gh_check(Some(path), auth)
}

/// Run `cmd` and collect its output, killing it if it runs past `limit`. Only
/// for commands with a few lines of output: the pipes are read after exit.
fn output_within(mut cmd: Command, limit: Duration) -> Result<Output, String> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Couldn't start gh: {e}"))?;
    let deadline = Instant::now() + limit;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "gh auth status didn't answer within {}s.",
                    limit.as_secs()
                ));
            }
            Ok(None) => std::thread::sleep(POLL),
            Err(e) => return Err(format!("Couldn't wait for gh: {e}")),
        }
    }
    child
        .wait_with_output()
        .map_err(|e| format!("Couldn't read gh's output: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_every_check_once_in_order() {
        let checks = run();
        let ids: Vec<&str> = checks.iter().map(|c| c.id).collect();
        assert_eq!(ids, ["git", "claude", "gh", "codex"]);
        assert!(checks.iter().all(|c| c.ok == c.fix.is_none()));
        assert!(!checks[3].required, "codex is optional");
    }

    #[test]
    fn a_command_past_its_limit_is_killed() {
        let cmd = crate::platform::test_process::slow();
        let started = Instant::now();
        let err = output_within(cmd, Duration::from_millis(100)).unwrap_err();
        assert!(err.contains("didn't answer"), "{err}");
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
