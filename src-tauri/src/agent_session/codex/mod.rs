//! The Codex adapter: one `codex app-server` per agent, speaking JSON-RPC over
//! stdio (see docs/AGENT_CHAT.md). Built against codex-cli 0.147.0's protocol
//! (`codex app-server generate-ts`), recorded in `fixtures/`.
//!
//! Threads as in the Claude adapter: two read (stdout and stderr lines), and a
//! third owns the child, its stdin and the `Translator`, one message at a time,
//! so nothing is shared or locked. The adapter's methods just queue a message.

mod args;
mod input;
mod prompts;
pub(crate) mod threads;
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

use super::claude::book::now_ms;
use super::claude::deliver::Pacer;
use super::journal::{Answer, Tone};
use super::{AgentAdapter, JournalSink, LaunchSpec, UserMessage};
use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::build_effective_cli_env;
use crate::platform::ports::{ProcessHost, ToolLocator};
use crate::platform::Os;
use translate::{Out, Translator};

/// How many stderr lines to keep for saying why Codex exited.
const STDERR_TAIL: usize = 5;

enum Cmd {
    Line(String),
    Stderr(String),
    Eof,
    Send(UserMessage),
    Answer(String, Answer),
    Interrupt,
    /// Interrupt the sub-agent spawned by this call.
    StopSubagent(String),
    Stop,
}

/// A running Codex chat agent. Dropping it stops the process.
pub struct CodexAdapter {
    tx: Sender<Cmd>,
}

impl CodexAdapter {
    /// Start `codex app-server` for `spec` and stream its rows into `sink`.
    /// Resumes `spec.resume`, or the workspace's saved thread, or starts one.
    pub fn launch(spec: LaunchSpec, sink: Arc<dyn JournalSink>) -> Result<Self, String> {
        let cwd = spec.cwd.to_string_lossy().into_owned();
        let split = args::split(&spec.extra_args, spec.model.clone(), cwd);
        let mut child = spawn(&spec, &split.server_args)?;
        let stdin = child
            .stdin
            .take()
            .ok_or("Codex's input wasn't available.")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Codex's output wasn't available.")?;
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
        let resume = spec
            .resume
            .clone()
            .or_else(|| threads::saved(&spec.workspace_id));
        let mut tr = Translator::new(spec.next_seq, now_ms, split.settings, resume);
        let mut first = tr.start();
        if !split.ignored.is_empty() {
            let text = format!(
                "Not passed to codex app-server (no such option there): {}",
                split.ignored.join(" ")
            );
            first.extend(tr.notice(&text, Tone::Warning));
        }
        let agent = Agent {
            workspace_id: spec.workspace_id,
            child,
            stdin: Some(stdin),
            sink,
            paced: Pacer::default(),
            saved_thread: None,
        };
        std::thread::spawn(move || run(rx, agent, tr, first));
        Ok(Self { tx })
    }

    fn queue(&self, cmd: Cmd) -> Result<(), String> {
        self.tx
            .send(cmd)
            .map_err(|_| "This agent isn't running.".to_string())
    }
}

impl AgentAdapter for CodexAdapter {
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
}

impl Drop for CodexAdapter {
    fn drop(&mut self) {
        let _ = self.tx.send(Cmd::Stop);
    }
}

/// `codex app-server`, through `platform::process` like every spawn.
fn spawn(spec: &LaunchSpec, server_args: &[String]) -> Result<Child, String> {
    let overrides: HashMap<String, String> = spec.env.iter().cloned().collect();
    let env = build_effective_cli_env(&overrides);
    let cli =
        find_cli_with_env("codex", Some(&env)).ok_or("Could not find the `codex` CLI on PATH")?;
    // An npm install is a `.cmd` shim on Windows: run it the way a PTY does.
    let argv = Os::pty_invocation(&cli);
    let (program, lead) = argv.split_first().ok_or("No way to run the `codex` CLI.")?;
    let mut cmd = crate::platform::process::command(program);
    cmd.args(lead).arg("app-server").args(server_args);
    cmd.env_clear();
    cmd.envs(&env);
    cmd.current_dir(&spec.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn()
        .map_err(|e| format!("Couldn't start codex: {e}"))
}

fn pump_stderr(stderr: impl Read, tx: Sender<Cmd>) {
    for line in BufReader::new(stderr).lines() {
        let Ok(line) = line else { break };
        if tx.send(Cmd::Stderr(line)).is_err() {
            return;
        }
    }
}

/// What the agent's own thread owns besides the translator.
struct Agent {
    workspace_id: String,
    child: Child,
    stdin: Option<ChildStdin>,
    sink: Arc<dyn JournalSink>,
    paced: Pacer,
    /// The thread id last saved for resuming.
    saved_thread: Option<String>,
}

/// The agent's own thread: everything that touches the child or the translator.
fn run(rx: Receiver<Cmd>, mut agent: Agent, mut tr: Translator, first: Vec<Out>) {
    let mut stopping = false;
    let mut stderr_tail: VecDeque<String> = VecDeque::new();
    for out in first {
        agent.deliver(out);
    }
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
            Cmd::Send(message) => tr.send(
                &message.text,
                &message.attachments,
                input::user_input(&message),
            ),
            Cmd::Answer(request_id, answer) => tr
                .answer(&request_id, answer)
                .unwrap_or_else(|e| tr.notice(&e, Tone::Warning)),
            Cmd::Interrupt => tr.interrupt(),
            Cmd::StopSubagent(call_id) => tr
                .stop_subagent(&call_id)
                .unwrap_or_else(|e| tr.notice(&e, Tone::Warning)),
            Cmd::Stop => {
                if !stopping {
                    stopping = true;
                    // Closing stdin ends app-server; the kill makes sure.
                    agent.stdin = None;
                    Os::stop_tree(agent.child.id());
                    let _ = agent.child.kill();
                }
                continue;
            }
            Cmd::Eof => {
                let status = agent.child.wait();
                let reason = (!stopping).then(|| exit_reason(status, &stderr_tail));
                for out in tr.exited(reason.as_deref()) {
                    agent.deliver(out);
                }
                agent.sink.exited(reason);
                return;
            }
        };
        for out in outs {
            agent.deliver(out);
        }
    }
}

impl Agent {
    fn deliver(&mut self, out: Out) {
        match out {
            Out::Row(row) => {
                if self.paced.passes(&row) {
                    self.sink.row(row);
                }
            }
            Out::Info(info) => {
                if let Some(thread) = &info.conversation_id {
                    if self.saved_thread.as_ref() != Some(thread) {
                        if let Err(e) = threads::save(&self.workspace_id, thread) {
                            eprintln!("trace: {e}");
                        }
                        self.saved_thread = Some(thread.clone());
                    }
                }
                self.sink.info(info);
            }
            Out::Send(value) => {
                let Some(pipe) = self.stdin.as_mut() else {
                    return;
                };
                let mut line = value.to_string();
                line.push('\n');
                // A failed write means Codex is gone; its EOF says so.
                if pipe
                    .write_all(line.as_bytes())
                    .and_then(|()| pipe.flush())
                    .is_err()
                {
                    self.stdin = None;
                }
            }
        }
    }
}

/// Why Codex ended when nobody asked it to: its exit status and last words.
fn exit_reason(
    status: std::io::Result<std::process::ExitStatus>,
    tail: &VecDeque<String>,
) -> String {
    let how = match status {
        Ok(s) if s.success() => "Codex exited.".to_string(),
        Ok(s) => format!("Codex exited ({s})."),
        Err(_) => "Codex exited.".to_string(),
    };
    match tail.back() {
        Some(last) => format!("{how} {}", crate::agent_session::journal::cap(&plain(last))),
        None => how,
    }
}

/// A log line without its terminal colours: Codex's stderr is `tracing` output.
fn plain(line: &str) -> String {
    let mut text = String::with_capacity(line.len());
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            text.push(c);
            continue;
        }
        // CSI: ESC [ parameters, then a final byte in @..~.
        if chars.next() == Some('[') {
            for c in chars.by_ref() {
                if ('@'..='~').contains(&c) {
                    break;
                }
            }
        }
    }
    text
}

#[cfg(test)]
mod plain_tests {
    #[test]
    fn colour_codes_are_dropped() {
        let line = "\u{1b}[2m2026\u{1b}[0m \u{1b}[31mERROR\u{1b}[0m boom";
        assert_eq!(super::plain(line), "2026 ERROR boom");
    }
}
