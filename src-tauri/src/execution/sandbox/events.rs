//! Reading a sandbox's event log, `~/.trace/events.log`, which its `trace-hook`
//! writes (`helpers`): one line per event, `<seq> <event> <base64 input>`.
//! It's how an agent in a sandbox tells trace what its hooks would locally,
//! turns ending and asking for a human, and the PRs it opens, and it keeps
//! what happened while no trace was attached.
//!
//! On attach trace tails it from the last `seq` it read (`offsets`). What it
//! missed (the backlog) is caught up on without replaying it: every PR is
//! recorded, and only the newest turn event is passed on, since that's where
//! the agent stands now. From then on each event is passed on as it comes.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine;
use serde::{Deserialize, Serialize};

use super::{Output, SandboxProvider};
use crate::helpers::persist::{self, Style};

/// Prints the log's id and length, then tails it from `$2 + 1` when `$1` is its
/// id (else from the start: a log this trace hasn't read, or a new sandbox's).
const FOLLOW: &str = r#"dir="$HOME/.trace"
mkdir -p "$dir" && touch "$dir/events.log"
[ -s "$dir/log-id" ] || cat /proc/sys/kernel/random/uuid > "$dir/log-id"
id=$(cat "$dir/log-id")
n=$(wc -l < "$dir/events.log")
from=1
[ "$id" = "$1" ] && from=$(( $2 + 1 ))
printf '%s %s\n' "$id" "$n"
exec tail -n +"$from" -F "$dir/events.log" 2>/dev/null
"#;

/// Where reading stopped: which log, and its last line read.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
struct Offset {
    log: String,
    seq: u64,
}

fn offsets_path() -> PathBuf {
    crate::helpers::trace_dir().join("sandbox-event-offsets.json")
}

fn read_offset(workspace_id: &str) -> Offset {
    persist::read_or_log::<HashMap<String, Offset>>(&offsets_path())
        .remove(workspace_id)
        .unwrap_or_default()
}

fn write_offset(workspace_id: &str, offset: &Offset) {
    let _ = persist::update(
        &offsets_path(),
        Style::Compact,
        |map: &mut HashMap<String, Offset>| {
            map.insert(workspace_id.to_string(), offset.clone());
        },
    );
}

/// Forget a deleted session's place in its log.
pub fn forget(workspace_id: &str) {
    let _ = persist::update(
        &offsets_path(),
        Style::Compact,
        |map: &mut HashMap<String, Offset>| {
            map.remove(workspace_id);
        },
    );
}

/// What a line asks for.
#[derive(Debug, PartialEq, Eq)]
enum Action {
    /// The agent opened this PR.
    Pr(String),
    /// A hook event, as `claude::hooks` takes it: `"<event> <base64 input>"`.
    Hook(String),
}

/// The log's lines, made into actions. Pure, so tested on its own.
#[derive(Default)]
struct Reader {
    offset: Offset,
    /// The log's length when reading began: lines up to it are the backlog.
    backlog: u64,
    /// The newest turn event in the backlog, passed on once it's read.
    held: Option<String>,
    started: bool,
}

impl Reader {
    fn feed(&mut self, line: &str) -> Vec<Action> {
        let line = line.trim_end();
        if !self.started {
            // The header: the log's id and length.
            self.started = true;
            let (id, n) = line.split_once(' ').unwrap_or((line, "0"));
            if id != self.offset.log {
                self.offset = Offset {
                    log: id.to_string(),
                    seq: 0,
                };
            }
            self.backlog = n.trim().parse().unwrap_or(0);
            return Vec::new();
        }
        let mut parts = line.splitn(3, ' ');
        let (Some(seq), Some(event)) = (parts.next(), parts.next()) else {
            return Vec::new();
        };
        let Ok(seq) = seq.parse::<u64>() else {
            return Vec::new();
        };
        if seq <= self.offset.seq {
            return Vec::new(); // read before: a reconnect replays the tail
        }
        self.offset.seq = seq;
        let payload = parts.next().unwrap_or("");
        let message = format!("{event} {payload}");
        let mut out = Vec::new();
        if event == "pr" {
            out.extend(pr_url(payload).map(Action::Pr));
        } else if seq <= self.backlog {
            self.held = Some(message);
        } else {
            out.extend(self.held.take().map(Action::Hook));
            out.push(Action::Hook(message));
        }
        // The backlog's last line: where the agent stands now goes on.
        if seq == self.backlog {
            out.extend(self.held.take().map(Action::Hook));
        }
        out
    }
}

fn pr_url(payload: &str) -> Option<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v["url"].as_str().map(str::to_string)
}

/// Turn events go here, for a terminal agent; a chat says them in-band.
pub type OnHook = Box<dyn Fn(&str) + Send>;

/// Reading a sandbox's log while it's attached. Dropping it stops reading.
pub struct Follower<P: SandboxProvider> {
    provider: Arc<P>,
    session_id: String,
    command: String,
    done: Arc<AtomicBool>,
}

impl<P: SandboxProvider> Drop for Follower<P> {
    fn drop(&mut self) {
        self.done.store(true, Ordering::Relaxed);
        let _ = self.provider.kill_command(&self.session_id, &self.command);
    }
}

/// Start reading `workspace_id`'s sandbox log. None when the tail couldn't
/// start: the session works on without it, as before.
pub fn follow<P: SandboxProvider>(
    provider: Arc<P>,
    session_id: &str,
    workspace_id: &str,
    on_hook: Option<OnHook>,
) -> Option<Follower<P>> {
    let offset = read_offset(workspace_id);
    let argv = vec![
        "bash".to_string(),
        "-c".to_string(),
        FOLLOW.to_string(),
        "trace-events".to_string(),
        offset.log.clone(),
        offset.seq.to_string(),
    ];
    let command = provider
        .start_command(session_id, &argv, &HashMap::new(), provider.home())
        .ok()?;
    let done = Arc::new(AtomicBool::new(false));
    let (reader, sid, cmd, ws) = (
        provider.clone(),
        session_id.to_string(),
        command.clone(),
        workspace_id.to_string(),
    );
    heartbeat(provider.clone(), session_id, done.clone());
    let stop = done.clone();
    std::thread::spawn(move || {
        let mut r = Reader {
            offset,
            ..Reader::default()
        };
        // The stream can drop while the tail runs on; reopening replays it,
        // and the reader skips what it has seen.
        for _ in 0..100 {
            if let Ok(stream) = reader.command_output(&sid, &cmd) {
                r.started = false;
                read(stream, &mut r, &ws, on_hook.as_deref(), &stop);
            }
            if stop.load(Ordering::Relaxed) || reader.command_done(&sid, &cmd).unwrap_or(true) {
                return;
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
    Some(Follower {
        provider,
        session_id: session_id.to_string(),
        command,
        done,
    })
}

/// While trace is attached, tell the sandbox's keep-alive someone's watching
/// (`helpers`), so it doesn't stop a sandbox the user is looking at.
fn heartbeat<P: SandboxProvider>(provider: Arc<P>, session_id: &str, done: Arc<AtomicBool>) {
    const EVERY: std::time::Duration = std::time::Duration::from_secs(120);
    let sid = session_id.to_string();
    let touch = vec![
        "bash".to_string(),
        "-c".to_string(),
        r#"mkdir -p "$HOME/.trace" && touch "$HOME/.trace/attached""#.to_string(),
    ];
    std::thread::spawn(move || {
        while !done.load(Ordering::Relaxed) {
            let _ = provider.exec(&sid, &touch, &HashMap::new());
            // Wake often enough to notice it's done.
            for _ in 0..EVERY.as_secs() {
                if done.load(Ordering::Relaxed) {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
    });
}

fn read(
    stream: super::OutputStream,
    r: &mut Reader,
    ws: &str,
    on_hook: Option<&(dyn Fn(&str) + Send)>,
    stop: &AtomicBool,
) {
    let mut pending = Vec::new();
    for chunk in stream {
        let Output::Stdout(bytes) = chunk else {
            continue;
        };
        pending.extend(bytes);
        while let Some(end) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            for action in r.feed(&String::from_utf8_lossy(&line)) {
                match action {
                    Action::Pr(url) => super::prs::record(ws, &url),
                    Action::Hook(message) => {
                        if let Some(f) = on_hook {
                            f(&message);
                        }
                    }
                }
            }
            if r.started {
                write_offset(ws, &r.offset);
            }
        }
        if stop.load(Ordering::Relaxed) {
            return;
        }
    }
}

#[cfg(test)]
#[path = "events_tests.rs"]
mod tests;
