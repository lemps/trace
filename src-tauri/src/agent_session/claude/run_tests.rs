//! The adapter's own thread against a fake process: how Stop and Detach end it.

use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};

use super::{book, run, Cmd, DETACHED};
use crate::agent_session::claude::translate::Translator;
use crate::agent_session::journal::{JournalBody, JournalRow};
use crate::agent_session::process::{ChatProcess, Exit};
use crate::agent_session::{JournalSink, SessionInfo};

#[derive(Default, Debug)]
struct Calls {
    killed: bool,
    detached_at: Option<u64>,
}

struct FakeProcess {
    calls: Arc<Mutex<Calls>>,
    /// Whether it can be left running (a remote one).
    remote: bool,
}

impl ChatProcess for FakeProcess {
    fn write_line(&mut self, _line: &str) -> bool {
        true
    }
    fn close_stdin(&mut self) {}
    fn kill(&mut self) {
        self.calls.lock().expect("calls").killed = true;
    }
    fn wait(&mut self) -> Exit {
        Exit::Unknown
    }
    fn pid(&self) -> Option<u32> {
        None
    }
    fn detach(&mut self, consumed: u64) -> bool {
        if self.remote {
            self.calls.lock().expect("calls").detached_at = Some(consumed);
        }
        self.remote
    }
}

#[derive(Default)]
struct Collect {
    texts: Mutex<Vec<String>>,
    exited: Mutex<bool>,
}

impl JournalSink for Collect {
    fn row(&self, row: JournalRow) {
        if let JournalBody::Status(s) = &row.body {
            self.texts.lock().expect("texts").push(s.text.clone());
        }
    }
    fn info(&self, _info: SessionInfo) {}
    fn exited(&self, _reason: Option<String>) {
        *self.exited.lock().expect("exited") = true;
    }
}

/// Run the thread over `cmds`, from `already_read` bytes in.
fn drive(remote: bool, already_read: u64, cmds: Vec<Cmd>) -> (Calls, Vec<String>, bool) {
    let calls = Arc::new(Mutex::new(Calls::default()));
    let sink = Arc::new(Collect::default());
    let (tx, rx) = channel();
    for cmd in cmds {
        tx.send(cmd).expect("send");
    }
    drop(tx);
    let process = Box::new(FakeProcess {
        calls: calls.clone(),
        remote,
    });
    run(
        rx,
        process,
        Translator::new(0, book::now_ms),
        sink.clone(),
        already_read,
    );
    let calls = std::mem::take(&mut *calls.lock().expect("calls"));
    let texts = sink.texts.lock().expect("texts").clone();
    let exited = *sink.exited.lock().expect("exited");
    (calls, texts, exited)
}

#[test]
fn stop_then_the_drops_detach_ends_it_rather_than_leaving_it() {
    // The registry stops the adapter, then drops it, and a remote one's Drop
    // sends Detach: the Stop has to win.
    let (calls, texts, exited) = drive(true, 0, vec![Cmd::Stop, Cmd::Detach, Cmd::Eof]);
    assert!(calls.killed);
    assert_eq!(calls.detached_at, None);
    assert!(!texts.iter().any(|t| t == DETACHED), "{texts:?}");
    assert!(exited);
}

#[test]
fn a_rejoined_remote_agent_detaches_at_its_absolute_offset() {
    let line = r#"{"type":"keep_alive"}"#.to_string();
    let len = line.len() as u64 + 1;
    let (calls, texts, exited) = drive(true, 50_000, vec![Cmd::Line(line), Cmd::Detach]);
    assert!(!calls.killed);
    assert_eq!(calls.detached_at, Some(50_000 + len));
    assert!(texts.iter().any(|t| t == DETACHED), "{texts:?}");
    assert!(exited);
}

#[test]
fn a_local_agent_asked_to_detach_is_stopped() {
    let (calls, _texts, _) = drive(false, 0, vec![Cmd::Detach, Cmd::Eof]);
    assert!(calls.killed);
    assert_eq!(calls.detached_at, None);
}
