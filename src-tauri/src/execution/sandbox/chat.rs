//! A chat agent in a sandbox: headless `claude` speaking stream-json, run as a
//! background command and driven through the provider's API. Its stdin is the
//! provider's stdin endpoint (one call per line, which suits a chat's few
//! messages); its stdout and stderr come from the command's log stream. The
//! Claude adapter can't tell it from a local child (`agent_session::process`).
//!
//! The conversation lives in the sandbox, which is saved when it stops, so a
//! new run resumes it by id. Stopping the agent stops the sandbox too: that's
//! what saves it.

use std::sync::mpsc::{channel, Sender};
use std::sync::Arc;

use super::chat_offsets;
use super::host::{ready, SandboxTarget, Secrets};
use super::{script, Output, SandboxProvider};
use crate::agent_session::process::{
    ChannelReader, ChatProcess, Exit, RemoteLaunch, RemoteOpener, Spawned,
};

/// Where the running chat command's id is kept in the sandbox, so the next run
/// can end one a quit left behind: two Claudes on one conversation would clash.
const COMMAND_FILE: &str = ".trace/chat-command";

/// The opener a sandbox host hands the chat runtime.
pub fn opener<P: SandboxProvider>(
    provider: Arc<P>,
    target: SandboxTarget,
    secrets: Secrets,
) -> RemoteOpener {
    Box::new(move |launch, say| open(provider, &target, &secrets, launch, say))
}

fn open<P: SandboxProvider>(
    provider: Arc<P>,
    target: &SandboxTarget,
    secrets: &Secrets,
    launch: RemoteLaunch,
    say: &dyn Fn(&str),
) -> Result<Spawned, String> {
    let ready = ready(&*provider, target, secrets, say)?;
    let sid = ready.session_id.clone();
    let ws = launch.workspace_id.clone();
    if !ready.fresh {
        let last = provider.exec(
            &sid,
            &script::read_home_file_argv(COMMAND_FILE),
            &Default::default(),
        )?;
        let last = last.stdout.trim().to_string();
        if last.starts_with("cmd_") {
            // Left running by a Disconnect or a quit: rejoin it, past what this
            // trace already shows.
            if !provider.command_done(&sid, &last).unwrap_or(true) {
                say("Rejoining Claude, still running in its sandbox…");
                let skip = chat_offsets::read(&ws, &last);
                return Ok(attach(provider, sid, last, ws, skip, None));
            }
            let _ = provider.kill_command(&sid, &last);
        }
    }
    // The conversation is pinned to the workspace, as for a local agent, and
    // resumed if this sandbox has it (a fresh one doesn't).
    let id = crate::claude::conversations::session_id_for(&launch.workspace_id)
        .unwrap_or_else(crate::helpers::new_id);
    crate::claude::conversations::upsert_session_id(&launch.workspace_id, &id)?;
    // One Claude per conversation: a terminal left running on it goes first.
    if !ready.fresh && ready.check(&*provider, script::tmux_alive_argv())? {
        let _ = provider.exec(&sid, &script::tmux_kill_argv(), &Default::default());
    }
    let resuming = !ready.fresh && ready.check(&*provider, script::conversation_argv(&id))?;
    let first_prompt = if resuming {
        launch.resume_prompt
    } else {
        launch.initial_prompt
    }
    .filter(|p| !p.trim().is_empty());
    say(if resuming {
        "Continuing the conversation…"
    } else {
        "Starting Claude…"
    });
    let mut argv = vec!["claude".to_string()];
    argv.extend(launch.args);
    argv.extend([
        if resuming { "--resume" } else { "--session-id" }.to_string(),
        id,
    ]);
    argv.extend(launch.extra_args);
    let mut env: std::collections::HashMap<String, String> = launch.env.into_iter().collect();
    env.extend(ready.env.clone());
    let command = provider.start_command(&sid, &argv, &env, &ready.dir)?;
    let _ = provider.exec(
        &sid,
        &script::write_home_file_argv(COMMAND_FILE, &command),
        &Default::default(),
    );

    chat_offsets::write(&ws, &command, 0);
    Ok(attach(provider, sid, command, ws, 0, first_prompt))
}

/// End a chat Claude left running in the sandbox, before a terminal starts one
/// on the same conversation.
pub(super) fn end_running<P: SandboxProvider>(provider: &P, sid: &str) -> Result<(), String> {
    let last = provider.exec(
        sid,
        &script::read_home_file_argv(COMMAND_FILE),
        &Default::default(),
    )?;
    let last = last.stdout.trim();
    if last.starts_with("cmd_") && !provider.command_done(sid, last).unwrap_or(true) {
        provider.kill_command(sid, last)?;
    }
    Ok(())
}

/// The chat command as a process for the adapter: its output read from `skip`
/// bytes in (what this trace already has), on its own thread.
fn attach<P: SandboxProvider>(
    provider: Arc<P>,
    sid: String,
    command: String,
    workspace_id: String,
    skip: u64,
    first_prompt: Option<String>,
) -> Spawned {
    let (out_tx, out_rx) = channel();
    let (err_tx, err_rx) = channel();
    // On its own thread: Claude prints nothing before its first message, and
    // the stream's response may not start until it does.
    let reader = provider.clone();
    let (rsid, rcmd) = (sid.clone(), command.clone());
    let skip_bytes = usize::try_from(skip).unwrap_or(usize::MAX);
    std::thread::spawn(move || follow(&*reader, &rsid, &rcmd, skip_bytes, &out_tx, &err_tx));
    Spawned {
        process: Box::new(SandboxChat {
            provider,
            session_id: sid,
            command,
            workspace_id,
            open: true,
        }),
        stdout: Box::new(ChannelReader::new(out_rx)),
        stderr: Some(Box::new(ChannelReader::new(err_rx))),
        already_read: skip,
        first_prompt,
    }
}

/// Pass the command's output on until it ends, reconnecting when the stream
/// drops while the command runs on (a network blip, a sleeping laptop). The
/// stream replays from the start, so a reconnect skips what was passed on.
fn follow<P: SandboxProvider>(
    provider: &P,
    sid: &str,
    command: &str,
    skip_stdout: usize,
    out_tx: &Sender<Vec<u8>>,
    err_tx: &Sender<Vec<u8>>,
) {
    // Old stderr only feeds the "why it exited" tail, so it isn't skipped.
    let mut sent = [skip_stdout, 0usize];
    let mut failures = 0;
    for _ in 0..MAX_RECONNECTS {
        match provider.command_output(sid, command) {
            Ok(stream) => {
                failures = 0;
                let mut seen = [0usize; 2];
                for chunk in stream {
                    let (i, bytes, tx) = match chunk {
                        Output::Stdout(b) => (0, b, out_tx),
                        Output::Stderr(b) => (1, b, err_tx),
                    };
                    let new = unsent(&bytes, seen[i], sent[i]);
                    seen[i] += bytes.len();
                    if !new.is_empty() {
                        if tx.send(new.to_vec()).is_err() {
                            return;
                        }
                        sent[i] += new.len();
                    }
                }
            }
            Err(why) => {
                failures += 1;
                if failures >= 5 {
                    let _ = err_tx
                        .send(format!("Couldn't read the agent's output: {why}\n").into_bytes());
                    return;
                }
            }
        }
        // The stream ended: with the command, or while it runs on.
        if provider.command_done(sid, command).unwrap_or(true) {
            return;
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// How many times to reopen a dropped output stream before giving up.
const MAX_RECONNECTS: usize = 100;

/// The part of `bytes` not passed on yet: it covers the stream from `seen`, and
/// everything before `sent` already went.
fn unsent(bytes: &[u8], seen: usize, sent: usize) -> &[u8] {
    &bytes[sent.saturating_sub(seen).min(bytes.len())..]
}

/// The chat command, as the adapter's process.
struct SandboxChat<P: SandboxProvider> {
    provider: Arc<P>,
    session_id: String,
    command: String,
    workspace_id: String,
    /// Its stdin is still open.
    open: bool,
}

impl<P: SandboxProvider> ChatProcess for SandboxChat<P> {
    fn write_line(&mut self, line: &str) -> bool {
        if !self.open {
            return false;
        }
        let data = format!("{line}\n");
        let ok = self
            .provider
            .write_stdin(&self.session_id, &self.command, data.as_bytes())
            .is_ok();
        self.open = ok;
        ok
    }

    fn close_stdin(&mut self) {
        if std::mem::take(&mut self.open) {
            let _ = self.provider.close_stdin(&self.session_id, &self.command);
        }
    }

    /// Ends Claude and stops the sandbox, which saves it to resume from.
    fn kill(&mut self) {
        let _ = self.provider.kill_command(&self.session_id, &self.command);
        let _ = self.provider.stop(&self.session_id);
    }

    fn wait(&mut self) -> Exit {
        match self.provider.wait_command(&self.session_id, &self.command) {
            Ok(Some(code)) => Exit::Code(code),
            _ => Exit::Unknown,
        }
    }

    fn pid(&self) -> Option<u32> {
        None
    }

    fn stopping_note(&self) -> Option<&'static str> {
        Some("Stopping Claude and saving the sandbox, a few seconds…")
    }

    /// Leave Claude running in the sandbox, noting how far this trace has read.
    fn detach(&mut self, consumed: u64) -> bool {
        chat_offsets::write(&self.workspace_id, &self.command, consumed);
        true
    }

    fn checkpoint(&mut self, consumed: u64) {
        chat_offsets::write(&self.workspace_id, &self.command, consumed);
    }
}

#[cfg(test)]
mod tests {
    use super::unsent;

    #[test]
    fn a_replayed_stream_skips_what_already_went() {
        // Fresh stream: nothing sent yet.
        assert_eq!(unsent(b"abc", 0, 0), b"abc");
        // Replayed from the start after 4 bytes went: skip them across chunks.
        assert_eq!(unsent(b"abc", 0, 4), b"");
        assert_eq!(unsent(b"def", 3, 4), b"ef");
        assert_eq!(unsent(b"ghi", 6, 4), b"ghi");
    }
}
