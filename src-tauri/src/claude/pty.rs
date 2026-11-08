//! Interactive PTY transport for the Claude TUI.
//!
//! Hosts the *real* interactive `claude` TUI inside a pseudo-terminal — the same
//! thing a human gets running `claude` in a terminal. No `--print`/
//! `--output-format`, so it bills as interactive usage (the point of this
//! transport now that headless `-p` mode is being retired).
//!
//! Output is a raw ANSI byte stream painting a screen, not structured JSON — the
//! frontend renders it in an xterm.js pane. Adapted from the previous project's
//! `claude/pty.rs`, with the websocket dependency removed.

use std::collections::HashMap;
use std::io::{Read, Write};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtyPair, PtySize};
use tauri::AppHandle;

use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::{build_effective_cli_env, MODEL_OVERRIDE_ENV_PREFIXES};
use crate::claude::{pty_exit, pty_output};
use crate::platform::ports::{AgentEnvironment, ProcessHost, ToolLocator};
use crate::platform::Os;

/// A live interactive Claude TUI hosted in a pseudo-terminal. Dropping `master`
/// closes the PTY and tears down the child, so keep it alive for the session.
pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

impl PtySession {
    /// Forward keystrokes / pasted text to the TUI.
    pub fn write_input(&mut self, data: &[u8]) -> std::io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
    }

    /// Resize so the TUI re-lays-out to the visible xterm dimensions.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {e}"))
    }

    /// The child's process id, which tells this run apart from a later one under the
    /// same workspace id.
    pub fn pid(&self) -> Option<u32> {
        self.child.process_id()
    }

    /// Terminate the child process (used by stop).
    pub fn kill(&mut self) {
        if let Some(pid) = self.child.process_id() {
            Os::stop_tree(pid);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Spawn the interactive `claude` TUI inside a PTY rooted at `cwd`.
///
/// `claude_session_id` resumes an existing conversation; otherwise `new_session_id`
/// pins the id of a brand-new one (the raw byte stream gives no way to read back a
/// generated id, so we choose it up front and persist it for next launch).
///
/// A background thread pumps PTY output to the frontend (`pty-output`); on EOF it
/// emits `agent-run-state{running:false}` and removes the session from state.
#[allow(clippy::too_many_arguments)]
pub fn spawn_agent_pty(
    app: AppHandle,
    workspace_id: String,
    cwd: String,
    // Which CLI to run: "claude" or "codex".
    cli: String,
    claude_session_id: Option<String>,
    new_session_id: Option<String>,
    model: Option<String>,
    // Extra CLI flags the user configured (e.g. --dangerously-skip-permissions),
    // appended verbatim after the managed flags.
    extra_args: Vec<String>,
    // First prompt passed as the CLI's positional argument — the TUI starts
    // with it already submitted. Far more robust than typing into the PTY
    // post-boot (no race with startup, and trust dialogs don't swallow it).
    // The caller picks it: the kickoff brief for a fresh conversation, a
    // carry-on nudge (or nothing) for a resumed one (`commands::agent::spawn_in`).
    prompt: Option<String>,
    env_overrides: HashMap<String, String>,
    cols: u16,
    rows: u16,
) -> Result<(PtySession, Option<u32>), String> {
    let effective_env = build_effective_cli_env(&env_overrides);
    let cli_path = find_cli_with_env(&cli, Some(&effective_env))
        .ok_or_else(|| format!("Could not find the `{cli}` CLI on PATH"))?;

    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    // Interactive invocation. CLI-specific flag-building lives here; the env and
    // pump loop below are CLI-agnostic.
    let mut cmd = CommandBuilder::from_argv(
        Os::pty_invocation(&cli_path)
            .into_iter()
            .map(Into::into)
            .collect(),
    );
    cmd.cwd(&cwd);
    match cli.as_str() {
        "claude" => {
            if let Some(model) = model.as_deref() {
                cmd.arg("--model");
                cmd.arg(model);
            }
            if let Some(sid) = claude_session_id.as_deref() {
                cmd.arg("--resume");
                cmd.arg(sid);
            } else if let Some(nsid) = new_session_id.as_deref() {
                cmd.arg("--session-id");
                cmd.arg(nsid);
            }
        }
        "codex" => {
            // Codex manages its own session state and uses different model flag
            // conventions across versions — invoke it bare for now and let it
            // pick up the user's defaults.
            let _ = (&claude_session_id, &new_session_id, &model);
        }
        other => {
            return Err(format!("Unknown agent CLI: {other}"));
        }
    }
    // User-provided flags last, so they can override or extend the managed ones.
    for arg in &extra_args {
        cmd.arg(arg);
    }
    // The positional prompt goes at the very end.
    if let Some(prompt) = prompt.as_deref() {
        cmd.arg(prompt);
    }

    // Start from a clean env, apply the effective env, skip model-override
    // prefixes that would defeat the CLI's `--model` alias resolution.
    cmd.env_clear();
    for (key, value) in &effective_env {
        let dominated = MODEL_OVERRIDE_ENV_PREFIXES
            .iter()
            .any(|prefix| key.starts_with(prefix));
        if !dominated {
            cmd.env(key, value);
        }
    }
    cmd.env("TERM", "xterm-256color");

    run_in_pty(app, workspace_id, pair, cmd, cols, rows)
}

/// Spawn an interactive login shell inside a PTY rooted at `cwd` — the "Terminal"
/// tab, a plain shell in the issue's worktree, distinct from the Claude agent in
/// the Chat tab. Inherits the user's environment (so their PATH/tools apply).
pub fn spawn_shell_pty(
    app: AppHandle,
    workspace_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(PtySession, Option<u32>), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new(Os::default_shell());
    cmd.cwd(&cwd);
    // A `claude` run in this shell must start as its own session too.
    for key in crate::claude::env::INHERITED_SESSION_ENV {
        cmd.env_remove(key);
    }
    cmd.env("TERM", "xterm-256color");
    run_in_pty(app, workspace_id, pair, cmd, cols, rows)
}

/// Spawn `cmd` against the PTY `pair`, register a pump thread that streams output
/// to the frontend and tears down state on EOF, and return the live session.
/// CLI-agnostic — shared by the agent and the plain-shell terminal.
fn run_in_pty(
    app: AppHandle,
    workspace_id: String,
    pair: PtyPair,
    cmd: CommandBuilder,
    cols: u16,
    rows: u16,
) -> Result<(PtySession, Option<u32>), String> {
    // An exit noted for an earlier run that its reader never read isn't this run's.
    pty_exit::take_natural_exit(&workspace_id);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn process in PTY: {e}"))?;
    // Close the parent's copy of the slave fd so the reader sees EOF on exit.
    drop(pair.slave);
    let pid = child.process_id();

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

    pty_output::begin_run(&app, &workspace_id, cols, rows);

    if !Os::pty_reports_exit() {
        pty_exit::watch_for_exit(app.clone(), workspace_id.clone(), pid);
    }

    let reader_app = app.clone();
    let reader_ws = workspace_id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF — the process exited
                Ok(n) => {
                    if !pty_output::record(&reader_app, &reader_ws, &buf[..n]) {
                        break; // torn down (e.g. session deleted)
                    }
                }
                Err(_) => break,
            }
        }
        pty_output::end_run(&reader_app, &reader_ws, pid.map(u64::from));
    });

    Ok((
        PtySession {
            writer,
            master: pair.master,
            child,
        },
        pid,
    ))
}
