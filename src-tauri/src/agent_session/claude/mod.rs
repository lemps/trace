//! The Claude adapter: one long-lived headless `claude` per agent, speaking
//! stream-json on stdin/stdout (see docs/AGENT_CHAT.md).
//!
//! Three threads per agent. Two only read (stdout lines, stderr lines) and pass
//! what they read on; the third owns everything else (the child, its stdin, the
//! `Translator`) and handles one message at a time, so no state is shared and
//! no lock is taken. The adapter's methods just queue a message for it.

pub(crate) mod book;
mod content;
mod handback;
mod prompts;
pub(crate) mod tools;
pub mod translate;

#[cfg(test)]
mod smoke;
#[cfg(test)]
mod tests;

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::journal::{Answer, Tone};
use super::{AgentAdapter, JournalSink, LaunchSpec, UserMessage};
use crate::claude::conversations::claude_session_ids;
use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::{build_effective_cli_env, MODEL_OVERRIDE_ENV_PREFIXES};
use crate::platform::ports::{ProcessHost, ToolLocator};
use crate::platform::Os;
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

/// Least time between two streaming revisions of one row sent on. Every delta
/// re-sends the whole text so far, so passing each one costs the square of the
/// answer's length; the final revision always goes.
const STREAM_EVERY: Duration = Duration::from_millis(50);

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
}

/// A running Claude chat agent. Dropping it stops the process.
pub struct ClaudeAdapter {
    tx: Sender<Cmd>,
    pid: u32,
}

impl ClaudeAdapter {
    /// Start `claude` for `spec` and stream its rows into `sink`. Resumes the
    /// workspace's saved conversation, or pins a fresh id, exactly as a terminal
    /// agent does (`claude::conversations`), unless `spec.resume` names one.
    pub fn launch(spec: LaunchSpec, sink: Arc<dyn JournalSink>) -> Result<Self, String> {
        let mut child = spawn(&spec)?;
        let pid = child.id();
        let stdin = child
            .stdin
            .take()
            .ok_or("Claude's input wasn't available.")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Claude's output wasn't available.")?;
        let stderr = child.stderr.take();
        let (tx, rx) = channel();
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
        let translator = Translator::new(spec.next_seq, book::now_ms);
        std::thread::spawn(move || run(rx, child, stdin, translator, sink));
        Ok(Self { tx, pid })
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

    fn pid(&self) -> Option<u32> {
        Some(self.pid)
    }
}

impl Drop for ClaudeAdapter {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Stop);
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
    cmd.args(lead).args(STREAM_FLAGS);
    if let Some(model) = &spec.model {
        cmd.args(["--model", model]);
    }
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
    mut child: Child,
    stdin: ChildStdin,
    mut tr: Translator,
    sink: Arc<dyn JournalSink>,
) {
    let mut stdin = Some(stdin);
    let mut stopping = false;
    let mut stderr_tail: VecDeque<String> = VecDeque::new();
    let mut paced = Pacer::default();
    while let Ok(cmd) = rx.recv() {
        let outs = match cmd {
            Cmd::Line(line) => tr.line(&line),
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
                    stdin = None;
                    Os::stop_tree(child.id());
                    let _ = child.kill();
                }
                continue;
            }
            Cmd::Eof => {
                let status = child.wait();
                let reason = (!stopping).then(|| exit_reason(status, &stderr_tail));
                for out in tr.exited(reason.as_deref()) {
                    deliver(out, sink.as_ref(), &mut stdin, &mut paced);
                }
                sink.exited(reason);
                return;
            }
        };
        for out in outs {
            deliver(out, sink.as_ref(), &mut stdin, &mut paced);
        }
    }
}

/// When each streaming row last went out.
#[derive(Default)]
pub(crate) struct Pacer(HashMap<String, Instant>);

impl Pacer {
    /// Whether this revision goes out now.
    pub(crate) fn passes(&mut self, row: &crate::agent_session::journal::JournalRow) -> bool {
        use crate::agent_session::journal::JournalBody;
        let streaming = matches!(&row.body, JournalBody::Message(m) if m.streaming);
        if !streaming {
            self.0.remove(&row.id);
            return true;
        }
        let now = Instant::now();
        match self.0.get(&row.id) {
            Some(last) if now.duration_since(*last) < STREAM_EVERY => false,
            _ => {
                self.0.insert(row.id.clone(), now);
                true
            }
        }
    }
}

fn deliver(out: Out, sink: &dyn JournalSink, stdin: &mut Option<ChildStdin>, paced: &mut Pacer) {
    match out {
        Out::Row(row) => {
            if paced.passes(&row) {
                sink.row(row);
            }
        }
        Out::Info(info) => sink.info(info),
        Out::Reply(value) => {
            let Some(pipe) = stdin.as_mut() else { return };
            let mut line = value.to_string();
            line.push('\n');
            // A failed write means Claude is gone; its EOF says so.
            if pipe
                .write_all(line.as_bytes())
                .and_then(|()| pipe.flush())
                .is_err()
            {
                *stdin = None;
            }
        }
    }
}

/// Why Claude ended when nobody asked it to: its exit status and last words.
fn exit_reason(
    status: std::io::Result<std::process::ExitStatus>,
    tail: &VecDeque<String>,
) -> String {
    let how = match status {
        Ok(s) if s.success() => "Claude exited.".to_string(),
        Ok(s) => format!("Claude exited ({s})."),
        Err(_) => "Claude exited.".to_string(),
    };
    match tail.back() {
        Some(last) => format!("{how} {}", crate::agent_session::journal::cap(last)),
        None => how,
    }
}
