//! A running sandbox agent as an [`AgentSession`]. One thread owns it: it gets
//! the sandbox ready (`host::prepare`), attaches a terminal to the agent's tmux
//! session, then pumps output into the same history and `pty-output` events a
//! local PTY uses, while applying the keystrokes and resizes sent to it.
//!
//! Dropping the session detaches: the agent keeps running in its sandbox, so
//! quitting trace doesn't end it and any trace can join it again. Only `stop`
//! ends the agent and the sandbox.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use super::host::{prepare, SandboxTarget, Secrets};
use super::{script, PtyRead, SandboxProvider};
use crate::claude::pty_output;
use crate::execution::{AgentSession, LiveSession, SpawnSpec};

/// How often to ask for more time while someone is attached.
const KEEPALIVE_EVERY: Duration = Duration::from_secs(10 * 60);
const KEEPALIVE_BY: Duration = Duration::from_secs(15 * 60);

enum Cmd {
    Input(Vec<u8>),
    Resize(u16, u16),
    Stop,
}

/// Sandbox runs' ids, far above any process id so the two never meet.
static NEXT_RUN: AtomicU64 = AtomicU64::new(1 << 40);

struct SandboxSession {
    tx: Sender<Cmd>,
    run: u64,
}

impl AgentSession for SandboxSession {
    fn write_input(&mut self, data: &[u8]) -> std::io::Result<()> {
        self.tx
            .send(Cmd::Input(data.to_vec()))
            .map_err(|_| std::io::Error::from(std::io::ErrorKind::BrokenPipe))
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.tx
            .send(Cmd::Resize(cols, rows))
            .map_err(|_| "The sandbox session has ended.".to_string())
    }

    /// Not a process on this machine.
    fn pid(&self) -> Option<u32> {
        None
    }

    fn run_id(&self) -> Option<u64> {
        Some(self.run)
    }

    fn stop(&mut self) {
        let _ = self.tx.send(Cmd::Stop);
    }

    /// Dropping it detaches: the agent runs on in its sandbox.
    fn can_detach(&self) -> bool {
        true
    }
}

/// Start the session's thread and hand back its handle straight away.
pub fn start<P: SandboxProvider>(
    app: AppHandle,
    provider: Arc<P>,
    target: SandboxTarget,
    secrets: Secrets,
    spec: SpawnSpec,
) -> LiveSession {
    let (tx, rx) = mpsc::channel();
    let id = NEXT_RUN.fetch_add(1, Ordering::Relaxed);
    std::thread::spawn(move || run(app, provider, target, secrets, spec, rx, id));
    Box::new(SandboxSession { tx, run: id })
}

fn run<P: SandboxProvider>(
    app: AppHandle,
    provider: Arc<P>,
    target: SandboxTarget,
    secrets: Secrets,
    spec: SpawnSpec,
    rx: Receiver<Cmd>,
    run_id: u64,
) {
    let ws = spec.workspace_id.clone();
    pty_output::begin_run(&app, &ws, spec.cols, spec.rows);
    // Dim progress lines; tmux repaints the whole screen once it attaches.
    let say = |line: &str| {
        pty_output::record(&app, &ws, format!("\x1b[2m{line}\x1b[0m\r\n").as_bytes());
    };
    let fail = |why: &str| {
        pty_output::record(&app, &ws, format!("\x1b[31m{why}\x1b[0m\r\n").as_bytes());
    };
    // A Start right after a Stop puts a new run under this id: this one's last
    // words would land on its screen, so they're said only while it's ours.
    let ours = || still_ours(&app, &ws, run_id);
    match prepare(&*provider, &target, &secrets, &spec, &say) {
        Ok((session_id, dir)) => match pump(&app, &*provider, &session_id, &dir, &spec, &rx) {
            Ok(ended) => {
                if let Some(line) = after(ended).filter(|_| ours()) {
                    say(line);
                }
            }
            Err(why) if ours() => {
                fail(&why);
                say(AFTER_LOST);
            }
            Err(_) => {}
        },
        Err(why) if ours() => fail(&why),
        Err(_) => {}
    }
    pty_output::end_run(&app, &ws, Some(run_id));
}

/// Whether the workspace's session is still this run (or gone, after a stop):
/// not a newer one started since.
fn still_ours(app: &AppHandle, workspace_id: &str, run_id: u64) -> bool {
    use tauri::Manager;
    app.try_state::<crate::state::AppState>()
        .is_none_or(|state| {
            state
                .pty_sessions
                .lock()
                .get(workspace_id)
                .is_none_or(|s| s.run_id() == Some(run_id))
        })
}

/// How a session that got going came to an end.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Ended {
    /// Stop: the agent and the sandbox, which Vercel saves.
    Stopped,
    /// Disconnect, or trace quitting: the agent works on.
    Detached,
    /// The agent itself exited; its sandbox is still up.
    Exited,
    /// The session was deleted: nothing is left to tell.
    Gone,
}

const AFTER_LOST: &str =
    "If the sandbox hit its plan's time limit, it was saved: Start resumes it, conversation and all.";

/// The line left in the terminal once a session ends, saying where things
/// stand and what Start will do: the screen is where people look.
fn after(ended: Ended) -> Option<&'static str> {
    match ended {
        Ended::Stopped => Some(
            "Stopped. The sandbox is saved: Start resumes it, conversation and all.",
        ),
        Ended::Detached => Some(
            "Disconnected. Claude keeps working in its sandbox until the plan's time limit; Start rejoins it.",
        ),
        Ended::Exited => Some("Claude exited. Its sandbox is still running: Start opens Claude there again."),
        Ended::Gone => None,
    }
}

/// Attach and pump until the agent ends, the session is stopped or dropped, or
/// the connection breaks (an error, though the agent may still be running).
fn pump<P: SandboxProvider>(
    app: &AppHandle,
    provider: &P,
    session_id: &str,
    dir: &str,
    spec: &SpawnSpec,
    rx: &Receiver<Cmd>,
) -> Result<Ended, String> {
    let mut pty = provider.open_pty(
        session_id,
        &script::tmux_attach_argv(),
        dir,
        spec.cols,
        spec.rows,
    )?;
    let mut extended = Instant::now();
    loop {
        loop {
            let sent = match rx.try_recv() {
                Ok(Cmd::Input(bytes)) => pty.send_input(&bytes),
                Ok(Cmd::Resize(cols, rows)) => pty.send_resize(cols, rows),
                Ok(Cmd::Stop) => {
                    pty.close();
                    return provider.stop(session_id).map(|()| Ended::Stopped);
                }
                Err(TryRecvError::Empty) => break,
                // Dropped: detach, and leave the agent running.
                Err(TryRecvError::Disconnected) => {
                    pty.close();
                    return Ok(Ended::Detached);
                }
            };
            if let Err(why) = sent {
                pty.close();
                return Err(format!("Lost the sandbox connection: {why}"));
            }
        }
        match pty.read() {
            PtyRead::Data(bytes) => {
                if !pty_output::record(app, &spec.workspace_id, &bytes) {
                    pty.close();
                    return Ok(Ended::Gone);
                }
            }
            PtyRead::Idle => {}
            PtyRead::Ended => return Ok(Ended::Exited),
            PtyRead::Failed(why) => return Err(format!("Lost the sandbox connection: {why}")),
        }
        if extended.elapsed() >= KEEPALIVE_EVERY {
            // Past the plan's limit this fails, and the sandbox ends on time.
            let _ = provider.extend(session_id, KEEPALIVE_BY);
            extended = Instant::now();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_ending_but_deletion_says_what_start_does() {
        for ended in [Ended::Stopped, Ended::Detached, Ended::Exited] {
            let line = after(ended).expect("a line");
            assert!(line.contains("Start"), "{line}");
        }
        assert_eq!(after(Ended::Gone), None);
    }
}
