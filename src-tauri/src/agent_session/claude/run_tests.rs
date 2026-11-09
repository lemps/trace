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
    written: Vec<String>,
}

struct FakeProcess {
    calls: Arc<Mutex<Calls>>,
    /// Whether it can be left running (a remote one).
    remote: bool,
}

impl ChatProcess for FakeProcess {
    fn write_line(&mut self, line: &str) -> bool {
        self.calls
            .lock()
            .expect("calls")
            .written
            .push(line.to_string());
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
    // No tools, so nothing comes back into the loop.
    let (back, _) = channel();
    run(
        rx,
        process,
        Translator::new(0, book::now_ms),
        sink.clone(),
        already_read,
        None,
        back,
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

#[test]
fn a_tool_call_is_answered_off_the_thread_as_a_control_response() {
    use crate::agent_session::ToolsHost;
    use serde_json::{json, Value};
    let calls = Arc::new(Mutex::new(Calls::default()));
    let (tx, rx) = channel();
    let tools = ToolsHost(Arc::new(|m: &Value| {
        Some(json!({ "jsonrpc": "2.0", "id": m["id"], "result": { "tools": [] } }))
    }));
    let process = Box::new(FakeProcess {
        calls: calls.clone(),
        remote: true,
    });
    let back = tx.clone();
    let line = json!({ "type": "control_request", "request_id": "r1", "request": {
        "subtype": "mcp_message", "server_name": "trace",
        "message": { "jsonrpc": "2.0", "id": 7, "method": "tools/list" } } });
    tx.send(Cmd::Line(line.to_string())).expect("send");
    let sink = Arc::new(Collect::default());
    let worker = std::thread::spawn(move || {
        run(
            rx,
            process,
            Translator::new(0, book::now_ms),
            sink,
            0,
            Some(tools),
            back,
        )
    });
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    let reply = loop {
        let written = calls.lock().expect("calls").written.clone();
        if let Some(w) = written.into_iter().find(|w| w.contains("mcp_response")) {
            break w;
        }
        assert!(std::time::Instant::now() < deadline, "no reply written");
        std::thread::sleep(std::time::Duration::from_millis(10));
    };
    let v: Value = serde_json::from_str(&reply).expect("json");
    assert_eq!(v["response"]["request_id"], "r1");
    assert_eq!(v["response"]["subtype"], "success");
    assert_eq!(v["response"]["response"]["mcp_response"]["id"], 7);
    tx.send(Cmd::Eof).expect("eof");
    worker.join().expect("joined");
}

#[test]
fn without_tools_an_mcp_request_is_refused() {
    let line = serde_json::json!({ "type": "control_request", "request_id": "r2", "request": {
        "subtype": "mcp_message", "server_name": "trace", "message": { "id": 1 } } });
    let (calls, _, _) = drive(true, 0, vec![Cmd::Line(line.to_string()), Cmd::Eof]);
    let refused = calls
        .written
        .iter()
        .find(|w| w.contains("r2"))
        .expect("answered");
    assert!(refused.contains("\"error\""), "{refused}");
}
