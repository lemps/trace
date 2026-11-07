//! A scheduled prompt's precheck: one shell line, run in the prompt's worktree
//! before each run, that decides whether the run goes ahead. Exit 0 runs it; any
//! other exit skips it (a "check CI" prompt whose precheck finds no new failure);
//! a precheck that runs past [`TIMEOUT`] or can't start fails the run, since that
//! says the check is broken rather than "nothing to do".
//!
//! The line goes through the platform's shell (`sh -c`, or `cmd /C` on Windows)
//! in a process group of its own, so a timeout or a stop takes down whatever it
//! started too.

use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Child, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::platform::ports::{AgentEnvironment, ProcessHost};
use crate::platform::Os;

pub mod gate;

/// The longest a precheck may run. It's a gate, not the work.
pub const TIMEOUT: Duration = Duration::from_secs(2 * 60);

/// Longest precheck line accepted.
pub const MAX_LEN: usize = 2000;

/// How much of the precheck's output a run keeps (the end of it: that's where
/// the reason usually is).
const OUTPUT_TAIL: usize = 2000;

/// How often the precheck is polled for exit, timeout or cancellation.
const POLL: Duration = Duration::from_millis(50);

/// After the shell exits, how long to wait for its output pipes to close (a
/// background child it left behind can hold them open).
const DRAIN: Duration = Duration::from_secs(2);

/// What a precheck did, kept on the run so its history says why it ran or not.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrecheckResult {
    /// The line as it ran.
    pub command: String,
    /// Exit code; `None` when it timed out, was stopped, or died by a signal.
    #[serde(default)]
    pub exit_code: Option<i32>,
    /// The end of its stdout then stderr, trimmed.
    #[serde(default)]
    pub output: String,
    /// It ran past [`TIMEOUT`] and was killed.
    #[serde(default)]
    pub timed_out: bool,
    /// Wall-clock milliseconds it took.
    #[serde(default)]
    pub millis: u64,
}

/// What the run does next.
#[derive(Debug, PartialEq)]
pub enum Verdict {
    Run,
    Skip,
    /// The run fails with this reason.
    Fail(String),
}

impl PrecheckResult {
    /// Exit 0 runs; another exit code skips; a timeout or a signal fails.
    pub fn verdict(&self) -> Verdict {
        match self.exit_code {
            Some(0) => Verdict::Run,
            Some(_) => Verdict::Skip,
            None if self.timed_out => Verdict::Fail(format!(
                "The precheck didn't finish within {}, so the prompt didn't run.",
                describe(TIMEOUT)
            )),
            None => Verdict::Fail("The precheck was killed before it finished.".to_string()),
        }
    }
}

/// Validate a precheck from the form: one line (Windows' `cmd /C` would drop
/// the rest), not too long. Blank means none.
pub fn normalize(line: Option<String>) -> Result<Option<String>, String> {
    let Some(line) = line.map(|l| l.trim().to_string()).filter(|l| !l.is_empty()) else {
        return Ok(None);
    };
    if line.contains(['\n', '\r']) {
        return Err("Keep the precheck to one line — chain commands with &&.".to_string());
    }
    if line.len() > MAX_LEN {
        return Err(format!("The precheck can be at most {MAX_LEN} characters."));
    }
    Ok(Some(line))
}

/// Run `line` in `cwd` with `env` laid over trace's own (as worktree setup
/// does), for at most `timeout`. Stops early when `cancelled` turns true (the
/// run was stopped). Errs only when the shell couldn't be started.
pub fn run(
    line: &str,
    cwd: &Path,
    env: &HashMap<String, String>,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> Result<PrecheckResult, String> {
    let mut command = Os::shell_line(line);
    command
        .current_dir(cwd)
        .envs(env)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Os::own_group(&mut command);
    let started = Instant::now();
    let mut child = command
        .spawn()
        .map_err(|e| format!("Couldn't start the precheck: {e}"))?;
    let output = collect_output(&mut child);
    let (status, timed_out) = wait(&mut child, started, timeout, cancelled);
    let millis = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    Ok(PrecheckResult {
        command: line.to_string(),
        exit_code: status.and_then(|s| s.code()),
        output: output(),
        timed_out,
        millis,
    })
}

/// Read stdout and stderr on their own threads (a full pipe would block the
/// shell); the returned closure joins them, giving up after [`DRAIN`].
fn collect_output(child: &mut Child) -> impl FnOnce() -> String {
    let (tx, rx) = mpsc::channel::<(usize, Vec<u8>)>();
    let pipes: [Option<Box<dyn Read + Send>>; 2] = [
        child
            .stdout
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
        child
            .stderr
            .take()
            .map(|p| Box::new(p) as Box<dyn Read + Send>),
    ];
    let mut readers = 0;
    for (index, pipe) in pipes.into_iter().enumerate() {
        let Some(mut pipe) = pipe else { continue };
        readers += 1;
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            let _ = tx.send((index, bytes));
        });
    }
    move || {
        let mut parts = [Vec::new(), Vec::new()];
        let deadline = Instant::now() + DRAIN;
        for _ in 0..readers {
            let left = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(left) {
                Ok((index, bytes)) => parts[index] = bytes,
                Err(_) => break,
            }
        }
        let mut text = String::from_utf8_lossy(&parts[0]).into_owned();
        let err = String::from_utf8_lossy(&parts[1]);
        if !text.trim().is_empty() && !err.trim().is_empty() {
            text.push('\n');
        }
        text.push_str(&err);
        tail(text.trim(), OUTPUT_TAIL)
    }
}

/// Wait for exit, killing the group on timeout or cancellation. Returns the
/// status (`None` if it was killed) and whether it timed out.
fn wait(
    child: &mut Child,
    started: Instant,
    timeout: Duration,
    cancelled: impl Fn() -> bool,
) -> (Option<ExitStatus>, bool) {
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return (Some(status), false),
            Ok(None) => {}
            Err(_) => break,
        }
        let timed_out = started.elapsed() >= timeout;
        if timed_out || cancelled() {
            kill(child);
            return (None, timed_out);
        }
        std::thread::sleep(POLL);
    }
    kill(child);
    (None, false)
}

fn kill(child: &mut Child) {
    Os::stop_group(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

/// "2 minutes", "45 seconds".
fn describe(d: Duration) -> String {
    let secs = d.as_secs();
    if secs.is_multiple_of(60) && secs >= 60 {
        let mins = secs / 60;
        format!("{mins} minute{}", if mins == 1 { "" } else { "s" })
    } else {
        format!("{secs} seconds")
    }
}

/// The last `max` chars of `text`, on a char boundary.
fn tail(text: &str, max: usize) -> String {
    let count = text.chars().count();
    text.chars().skip(count.saturating_sub(max)).collect()
}

#[cfg(test)]
mod tests;
