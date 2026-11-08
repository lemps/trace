//! The process behind a chat agent, wherever it runs. A chat adapter writes
//! lines to its stdin and reads lines from its stdout, so that's the port:
//! [`ChatProcess`] for writing, stopping and waiting, plus the two output
//! streams as plain readers. On this machine it's a child process
//! ([`LocalProcess`]); in a cloud sandbox it's a command driven over the
//! provider's API (`execution::sandbox::chat`).

use std::io::{Read, Write};
use std::process::{Child, ChildStdin};
use std::sync::mpsc::Receiver;

use crate::platform::ports::ProcessHost;
use crate::platform::Os;

/// How a process ended, as far as can be told.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exit {
    Code(i32),
    /// Ended, but the code isn't known (a signal, or a host that didn't say).
    Unknown,
}

/// A running chat agent's process.
pub trait ChatProcess: Send {
    /// Write one line (a newline is added). False once it can't take input.
    fn write_line(&mut self, line: &str) -> bool;
    /// End its input: a headless agent exits at end of input.
    fn close_stdin(&mut self);
    /// Make sure it's gone.
    fn kill(&mut self);
    /// Wait for it to end.
    fn wait(&mut self) -> Exit;
    /// Its process id on this machine, if it's here.
    fn pid(&self) -> Option<u32>;
    /// Let go of it and leave it running, having read `consumed` bytes of its
    /// stdout (so a rejoin can skip them). False when it can't run without
    /// trace (a local child), in which case it's stopped instead.
    fn detach(&mut self, _consumed: u64) -> bool {
        false
    }
    /// Note how much of its stdout has become journal rows, now and then, so a
    /// rejoin after a crash skips most of it.
    fn checkpoint(&mut self, _consumed: u64) {}
    /// What to tell the user while it stops, when that takes a while (saving a
    /// sandbox). None for a stop that's quick.
    fn stopping_note(&self) -> Option<&'static str> {
        None
    }
}

/// A started process and its output, ready for an adapter to pump.
pub struct Spawned {
    pub process: Box<dyn ChatProcess>,
    pub stdout: Box<dyn Read + Send>,
    pub stderr: Option<Box<dyn Read + Send>>,
    /// Bytes of its stdout already turned into rows before this run, which
    /// `stdout` starts after (a rejoined remote agent): where counting resumes.
    pub already_read: u64,
    /// What to send it first, chosen by the host (which alone knows whether it
    /// rejoined, resumed or started fresh).
    pub first_prompt: Option<String>,
}

/// What a remote host needs to start a chat agent: the agent's arguments
/// (without the program), its environment, and its workspace. The host picks
/// the conversation flags itself, since only it can see whether the
/// conversation is there to resume.
pub struct RemoteLaunch {
    pub workspace_id: String,
    /// The protocol and model flags; the host adds the conversation flag after.
    pub args: Vec<String>,
    /// Flags from Settings → Agents, last.
    pub extra_args: Vec<String>,
    /// The first message for a fresh conversation, and the one for a resumed
    /// one; a rejoined agent gets neither.
    pub initial_prompt: Option<String>,
    pub resume_prompt: Option<String>,
    pub env: Vec<(String, String)>,
}

/// Starts a chat agent on another host. Called on the agent's own thread, since
/// getting a sandbox ready takes seconds; `say` reports each step in the chat.
pub type RemoteOpener =
    Box<dyn FnOnce(RemoteLaunch, &dyn Fn(&str)) -> Result<Spawned, String> + Send>;

/// A child process on this machine.
pub struct LocalProcess {
    child: Child,
    stdin: Option<ChildStdin>,
}

impl LocalProcess {
    /// Take a spawned child's pipes. Its stdin must be piped.
    pub fn spawned(mut child: Child) -> Result<Spawned, String> {
        let stdin = child
            .stdin
            .take()
            .ok_or("The agent's input wasn't available.")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("The agent's output wasn't available.")?;
        let stderr = child.stderr.take();
        Ok(Spawned {
            process: Box::new(LocalProcess {
                child,
                stdin: Some(stdin),
            }),
            stdout: Box::new(stdout),
            stderr: stderr.map(|s| Box::new(s) as Box<dyn Read + Send>),
            already_read: 0,
            first_prompt: None,
        })
    }
}

impl ChatProcess for LocalProcess {
    fn write_line(&mut self, line: &str) -> bool {
        let Some(pipe) = self.stdin.as_mut() else {
            return false;
        };
        let ok = pipe
            .write_all(line.as_bytes())
            .and_then(|()| pipe.write_all(b"\n"))
            .and_then(|()| pipe.flush())
            .is_ok();
        if !ok {
            self.stdin = None;
        }
        ok
    }

    fn close_stdin(&mut self) {
        self.stdin = None;
    }

    fn kill(&mut self) {
        Os::stop_tree(self.child.id());
        let _ = self.child.kill();
    }

    fn wait(&mut self) -> Exit {
        match self.child.wait() {
            Ok(s) => s.code().map_or(Exit::Unknown, Exit::Code),
            Err(_) => Exit::Unknown,
        }
    }

    fn pid(&self) -> Option<u32> {
        Some(self.child.id())
    }
}

/// Bytes arriving on a channel, read like a pipe: what a remote host's output
/// stream is turned into. Ends when the sender goes.
pub struct ChannelReader {
    rx: Receiver<Vec<u8>>,
    buf: Vec<u8>,
    at: usize,
}

impl ChannelReader {
    pub fn new(rx: Receiver<Vec<u8>>) -> ChannelReader {
        ChannelReader {
            rx,
            buf: Vec::new(),
            at: 0,
        }
    }
}

impl Read for ChannelReader {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.at >= self.buf.len() {
            match self.rx.recv() {
                Ok(chunk) => {
                    self.buf = chunk;
                    self.at = 0;
                }
                Err(_) => return Ok(0),
            }
        }
        let n = out.len().min(self.buf.len() - self.at);
        out[..n].copy_from_slice(&self.buf[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};

    #[test]
    fn a_channel_reads_as_lines_however_it_was_chunked() {
        let (tx, rx) = std::sync::mpsc::channel();
        for chunk in ["{\"a\":", "1}\n{\"b\"", ":2}\n", "", "tail"] {
            tx.send(chunk.as_bytes().to_vec()).expect("send");
        }
        drop(tx);
        let lines: Vec<String> = BufReader::new(ChannelReader::new(rx))
            .lines()
            .map_while(Result::ok)
            .collect();
        assert_eq!(lines, ["{\"a\":1}", "{\"b\":2}", "tail"]);
    }
}
