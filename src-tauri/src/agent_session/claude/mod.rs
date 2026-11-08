//! The Claude adapter: one long-lived headless `claude` per agent, speaking
//! stream-json on stdin/stdout (see docs/AGENT_CHAT.md).
//!
//! Three threads per agent. Two only read (stdout lines, stderr lines) and pass
//! what they read on; the third owns everything else (the child, its stdin, the
//! `Translator`) and handles one message at a time, so no state is shared and
//! no lock is taken. The adapter's methods just queue a message for it.

pub(crate) mod book;
mod content;
pub(crate) mod deliver;
mod handback;
mod prompts;
pub(crate) mod tools;
pub mod translate;

#[cfg(test)]
mod run_tests;
#[cfg(test)]
mod smoke;
#[cfg(test)]
mod tests;

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;

use super::journal::{Answer, Tone};
use super::process::{ChatProcess, LocalProcess, RemoteLaunch, RemoteOpener};
use super::{AgentAdapter, JournalSink, LaunchSpec, UserMessage};
use crate::claude::conversations::claude_session_ids;
use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::{build_effective_cli_env, MODEL_OVERRIDE_ENV_PREFIXES};
use crate::platform::ports::ToolLocator;
use crate::platform::Os;
use deliver::{deliver, exit_reason, Pacer};
use translate::{Out, Translator};

/// The flags that make `claude` a structured, long-lived peer rather than a TUI.
const STREAM_FLAGS: [&str; 9] = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompt-tool",
    "stdio",
];

/// How many stderr lines to keep for saying why Claude exited.
const STDERR_TAIL: usize = 5;

enum Cmd {
    Line(String),
    Stderr(String),
    Eof,
    Send(UserMessage),
    Answer(String, Answer),
    Interrupt,
    /// `stop_task` for the subagent started by this call.
    StopSubagent(String),
    Stop,
    /// Let go and leave it running (a remote agent).
    Detach,
}

/// Said in the chat when it's left running.
const DETACHED: &str =
    "Disconnected. Claude keeps working in its sandbox until the plan's time limit; Start rejoins it.";

/// How often to note how far the journal has got (`ChatProcess::checkpoint`).
const CHECKPOINT_EVERY: std::time::Duration = std::time::Duration::from_secs(3);

/// A running Claude chat agent. Dropping it stops the process.
pub struct ClaudeAdapter {
    tx: Sender<Cmd>,
    pid: u32,
    /// It runs on another host, so it can be left running.
    remote: bool,
}

impl ClaudeAdapter {
    /// Start `claude` for `spec` and stream its rows into `sink`. Resumes the
    /// workspace's saved conversation, or pins a fresh id, exactly as a terminal
    /// agent does (`claude::conversations`), unless `spec.resume` names one.
    pub fn launch(spec: LaunchSpec, sink: Arc<dyn JournalSink>) -> Result<Self, String> {
        let spawned = LocalProcess::spawned(spawn(&spec)?)?;
        let pid = spawned.process.pid().unwrap_or_default();
        let (tx, rx) = channel();
        pump(spawned.stdout, spawned.stderr, &tx);
        let translator = Translator::new(spec.next_seq, book::now_ms);
        let process = spawned.process;
        std::thread::spawn(move || run(rx, process, translator, sink, 0));
        Ok(Self {
            tx,
            pid,
            remote: false,
        })
    }

    /// Start `claude` on another host through `open`, on the agent's own thread:
    /// getting a sandbox ready takes seconds, and each step shows in the chat.
    /// Messages sent meanwhile wait their turn.
    pub fn launch_remote(spec: LaunchSpec, sink: Arc<dyn JournalSink>, open: RemoteOpener) -> Self {
        let (tx, rx) = channel();
        let out_tx = tx.clone();
        std::thread::spawn(move || {
            let tr = RefCell::new(Translator::new(spec.next_seq, book::now_ms));
            let say = |text: &str| {
                for out in tr.borrow_mut().notice(text, Tone::Info) {
                    if let Out::Row(row) = out {
                        sink.row(row);
                    }
                }
            };
            let launch = RemoteLaunch {
                workspace_id: spec.workspace_id.clone(),
                args: stream_args(&spec),
                extra_args: spec.extra_args.clone(),
                initial_prompt: None,
                resume_prompt: None,
                env: spec.env.clone(),
            };
            match open(launch, &say) {
                Ok(spawned) => {
                    if let Some(text) = spawned.first_prompt {
                        let first = UserMessage {
                            text,
                            attachments: Vec::new(),
                        };
                        let _ = out_tx.send(Cmd::Send(first));
                    }
                    pump(spawned.stdout, spawned.stderr, &out_tx);
                    let base = spawned.already_read;
                    run(rx, spawned.process, tr.into_inner(), sink, base);
                }
                Err(why) => {
                    let mut tr = tr.into_inner();
                    for out in tr.exited(Some(&why)) {
                        if let Out::Row(row) = out {
                            sink.row(row);
                        }
                    }
                    sink.exited(Some(why));
                }
            }
        });
        // Not a process on this machine.
        Self {
            tx,
            pid: 0,
            remote: true,
        }
    }

    fn queue(&self, cmd: Cmd) -> Result<(), String> {
        self.tx
            .send(cmd)
            .map_err(|_| "This agent isn't running.".to_string())
    }
}

impl AgentAdapter for ClaudeAdapter {
    fn send(&mut self, message: UserMessage) -> Result<(), String> {
        self.queue(Cmd::Send(message))
    }

    fn answer(&mut self, request_id: &str, answer: Answer) -> Result<(), String> {
        self.queue(Cmd::Answer(request_id.to_string(), answer))
    }

    fn interrupt(&mut self) -> Result<(), String> {
        self.queue(Cmd::Interrupt)
    }

    fn stop_subagent(&mut self, call_id: &str) -> Result<(), String> {
        self.queue(Cmd::StopSubagent(call_id.to_string()))
    }

    fn stop(&mut self) {
        let _ = self.tx.send(Cmd::Stop);
    }

    fn detach(&mut self) -> bool {
        self.remote && self.tx.send(Cmd::Detach).is_ok()
    }

    fn pid(&self) -> Option<u32> {
        (self.pid != 0).then_some(self.pid)
    }
}

impl Drop for ClaudeAdapter {
    /// A local agent can't outlive its adapter; a remote one is left running.
    fn drop(&mut self) {
        let _ = self
            .tx
            .send(if self.remote { Cmd::Detach } else { Cmd::Stop });
    }
}

/// The flags every chat `claude` gets before its conversation flag, wherever
/// it runs: the stream-json protocol and the model.
fn stream_args(spec: &LaunchSpec) -> Vec<String> {
    let mut args: Vec<String> = STREAM_FLAGS.iter().map(|f| f.to_string()).collect();
    if let Some(model) = &spec.model {
        args.extend(["--model".to_string(), model.clone()]);
    }
    args
}

/// Read the agent's output on two threads, stdout lines (then its end) and
/// stderr lines, into the agent's own thread.
fn pump(stdout: Box<dyn Read + Send>, stderr: Option<Box<dyn Read + Send>>, tx: &Sender<Cmd>) {
    let out_tx = tx.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if out_tx.send(Cmd::Line(line)).is_err() {
                return;
            }
        }
        let _ = out_tx.send(Cmd::Eof);
    });
    if let Some(stderr) = stderr {
        let err_tx = tx.clone();
        std::thread::spawn(move || pump_stderr(stderr, err_tx));
    }
}

/// The `claude` process, through `platform::process` like every spawn.
fn spawn(spec: &LaunchSpec) -> Result<Child, String> {
    let overrides: HashMap<String, String> = spec.env.iter().cloned().collect();
    let env = build_effective_cli_env(&overrides);
    let cli =
        find_cli_with_env("claude", Some(&env)).ok_or("Could not find the `claude` CLI on PATH")?;
    let cwd = spec.cwd.to_string_lossy().into_owned();
    let (resume, fresh) = match &spec.resume {
        Some(id) => (Some(id.clone()), None),
        None => claude_session_ids(&spec.workspace_id, "claude", &cwd),
    };
    // An npm install is a `.cmd` shim on Windows: run it the way a PTY does.
    let argv = Os::pty_invocation(&cli);
    let (program, lead) = argv
        .split_first()
        .ok_or("No way to run the `claude` CLI.")?;
    let mut cmd = crate::platform::process::command(program);
    cmd.args(lead).args(stream_args(spec));
    match (resume, fresh) {
        (Some(id), _) => cmd.args(["--resume", &id]),
        (None, Some(id)) => cmd.args(["--session-id", &id]),
        (None, None) => &mut cmd,
    };
    cmd.args(&spec.extra_args);
    // A clean env, minus prefixes that would defeat `--model` alias resolution.
    cmd.env_clear();
    cmd.envs(env.iter().filter(|(key, _)| {
        !MODEL_OVERRIDE_ENV_PREFIXES
            .iter()
            .any(|prefix| key.starts_with(prefix))
    }));
    cmd.current_dir(&spec.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn()
        .map_err(|e| format!("Couldn't start claude: {e}"))
}

fn pump_stderr(stderr: impl Read, tx: Sender<Cmd>) {
    for line in BufReader::new(stderr).lines() {
        let Ok(line) = line else { break };
        if tx.send(Cmd::Stderr(line)).is_err() {
            return;
        }
    }
}

/// The agent's own thread: everything that touches the child or the translator.
fn run(
    rx: Receiver<Cmd>,
    mut process: Box<dyn ChatProcess>,
    mut tr: Translator,
    sink: Arc<dyn JournalSink>,
    // Stdout already read before this run (a rejoin), so offsets stay absolute.
    already_read: u64,
) {
    let mut stopping = false;
    // Bytes of stdout turned into rows, for a rejoin to skip.
    let mut consumed: u64 = already_read;
    let mut noted = std::time::Instant::now();
    let mut stderr_tail: VecDeque<String> = VecDeque::new();
    let mut paced = Pacer::default();
    while let Ok(cmd) = rx.recv() {
        let outs = match cmd {
            Cmd::Line(line) => {
                consumed += line.len() as u64 + 1;
                if noted.elapsed() >= CHECKPOINT_EVERY {
                    process.checkpoint(consumed);
                    noted = std::time::Instant::now();
                }
                tr.line(&line)
            }
            Cmd::Detach => {
                // A Stop came first (the registry drops the adapter after
                // stopping it): it's ending, not being left running.
                if stopping {
                    continue;
                }
                if process.detach(consumed) {
                    for out in tr.notice(DETACHED, Tone::Info) {
                        deliver(out, sink.as_ref(), process.as_mut(), &mut paced);
                    }
                    sink.exited(None);
                    return;
                }
                // Here it can't run on without trace: stop it like a Stop.
                if !stopping {
                    stopping = true;
                    process.close_stdin();
                    process.kill();
                }
                continue;
            }
            Cmd::Stderr(line) => {
                if !line.trim().is_empty() {
                    stderr_tail.push_back(line);
                    if stderr_tail.len() > STDERR_TAIL {
                        stderr_tail.pop_front();
                    }
                }
                continue;
            }
            Cmd::Send(message) => {
                let text = crate::agent_session::attachments::shown_text(&message);
                tr.send(&text, content::user_content(&message))
            }
            Cmd::Answer(request_id, answer) => tr
                .answer(&request_id, answer)
                .unwrap_or_else(|e| tr.notice(&e, Tone::Warning)),
            Cmd::Interrupt => tr.interrupt().map(Out::Reply).into_iter().collect(),
            Cmd::StopSubagent(call_id) => match tr.stop_subagent(&call_id) {
                Ok(reply) => vec![Out::Reply(reply)],
                Err(e) => tr.notice(&e, Tone::Warning),
            },
            Cmd::Stop => {
                if !stopping {
                    stopping = true;
                    // Closing stdin ends a headless Claude; the kill makes sure.
                    process.close_stdin();
                    process.kill();
                }
                continue;
            }
            Cmd::Eof => {
                let status = process.wait();
                let reason = (!stopping).then(|| exit_reason(status, &stderr_tail));
                for out in tr.exited(reason.as_deref()) {
                    deliver(out, sink.as_ref(), process.as_mut(), &mut paced);
                }
                sink.exited(reason);
                return;
            }
        };
        for out in outs {
            deliver(out, sink.as_ref(), process.as_mut(), &mut paced);
        }
    }
}
