//! The handshake and turn edges the recordings don't reach: resuming a saved
//! thread (and one Codex never saved), messages sent before the thread is up
//! or while a turn runs, an interrupt with a prompt open, the process ending.

use serde_json::{json, Value};

use super::replay::{settings, Replay};
use super::{DENY, FILES};
use crate::agent_session::journal::*;

const INIT_OK: &str = r#"{"id":0,"result":{"userAgent":"codex","platformOs":"windows"}}"#;
const THREAD: &str = "01a1b60b-0000-7000-8000-000000000001";

fn thread_ok(id: u64) -> String {
    json!({"id": id, "result": {"thread": {"id": THREAD}, "model": "gpt-5.6-sol"}}).to_string()
}

fn methods(frames: &[Value]) -> Vec<&str> {
    frames.iter().filter_map(|f| f["method"].as_str()).collect()
}

fn text(t: &str) -> Vec<Value> {
    vec![json!({"type": "text", "text": t, "text_elements": []})]
}

#[test]
fn a_saved_thread_resumes_and_an_unsaved_one_starts_fresh() {
    let mut r = Replay::new(settings(None, None, None), Some("gone".into()));
    r.feed(INIT_OK);
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(
        methods(&sent),
        ["initialize", "initialized", "thread/resume"]
    );
    assert_eq!(
        sent[2]["params"],
        json!({"cwd": "C:/dev/demo", "threadId": "gone", "excludeTurns": true})
    );
    let refused = json!({"id": 1, "error": {"code": -32600,
        "message": "no rollout found for thread id gone"}});
    r.feed(&refused.to_string());
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(methods(&sent), ["thread/start"]);
    r.feed(&thread_ok(2));
    assert_eq!(r.run.info.conversation_id.as_deref(), Some(THREAD));
    assert_eq!(r.run.info.model.as_deref(), Some("gpt-5.6-sol"));
    assert!(r.run.statuses().is_empty());
}

#[test]
fn a_message_before_the_thread_waits_and_one_during_a_turn_steers() {
    let mut r = Replay::new(settings(None, None, None), None);
    r.unsent.clear();
    let early = r.run.take(r.tr.send("first", &[], text("first")));
    assert!(
        early.is_empty(),
        "nothing goes before the thread: {early:?}"
    );
    r.feed(INIT_OK);
    r.feed(&thread_ok(1));
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(
        methods(&sent),
        ["initialized", "thread/start", "turn/start"]
    );
    assert_eq!(sent[2]["params"]["input"], json!(text("first")));
    // A second message while turn/start hasn't answered waits for its turn id.
    assert!(r
        .run
        .take(r.tr.send("second", &[], text("second")))
        .is_empty());
    let started = json!({"id": 2, "result": {"turn": {"id": "t1", "status": "inProgress"}}});
    r.feed(&started.to_string());
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(methods(&sent), ["turn/steer"]);
    assert_eq!(sent[0]["params"]["expectedTurnId"], "t1");
    // Both messages belong to the one turn.
    assert_eq!(r.run.turns().len(), 1);
    // Refused because the turn just ended: it starts the next turn instead.
    let done = json!({"method": "turn/completed",
        "params": {"turn": {"id": "t1", "status": "completed", "durationMs": 5}}});
    r.feed(&done.to_string());
    r.feed(r#"{"id":3,"error":{"code":-32600,"message":"no active turn"}}"#);
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(methods(&sent), ["turn/start"]);
    assert_eq!(sent[0]["params"]["input"], json!(text("second")));
}

#[test]
fn an_interrupt_before_codex_names_the_turn_is_sent_once_it_does() {
    let mut r = Replay::new(settings(None, None, None), None);
    r.feed(INIT_OK);
    r.feed(&thread_ok(1));
    r.unsent.clear();
    r.run.take(r.tr.send("go", &[], text("go")));
    assert!(r.run.take(r.tr.interrupt()).is_empty());
    let started = json!({"id": 2, "result": {"turn": {"id": "t1"}}});
    r.feed(&started.to_string());
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(methods(&sent), ["turn/interrupt"]);
    assert_eq!(
        sent[0]["params"],
        json!({"threadId": THREAD, "turnId": "t1"})
    );
    r.feed(r#"{"method":"turn/completed","params":{"turn":{"id":"t1","status":"interrupted"}}}"#);
    assert_eq!(r.run.turns()[0].state, TurnState::Interrupted);
}

#[test]
fn an_interrupt_cancels_the_open_approval_codex_resolves() {
    let mut r = Replay::new(super::untrusted(), None);
    r.until(DENY, Some(r#">>> {"id":0,"result""#));
    let a = r.run.approvals()[0].clone();
    assert!(a.resolution.is_none());
    let sent = r.run.take(r.tr.interrupt());
    assert_eq!(methods(&sent), ["turn/interrupt"]);
    r.feed(r#"{"method":"serverRequest/resolved","params":{"requestId":0}}"#);
    assert_eq!(r.run.approvals()[0].resolution, Some(Resolution::Cancelled));
    assert!(r.tr.answer(&a.request_id, approve()).is_err());
    let done = r#"{"method":"turn/completed","params":{"turn":{"id":"01a1b60b-a0d8-7e01-acef-2e06d670797e","status":"interrupted"}}}"#;
    r.feed(done);
    assert_eq!(r.run.tools()[0].state, ToolState::Failed);
    assert_eq!(r.run.turns()[0].state, TurnState::Interrupted);
}

#[test]
fn the_process_ending_mid_turn_settles_what_was_open() {
    let mut r = Replay::new(super::untrusted(), None);
    r.until(FILES, Some(r#">>> {"id":0,"result""#));
    assert!(r.run.info.busy);
    r.run
        .take(r.tr.exited(Some("Codex exited (exit code: 1).")));
    assert_eq!(r.run.approvals()[0].resolution, Some(Resolution::Cancelled));
    let patch = r
        .run
        .tools()
        .into_iter()
        .find(|t| t.name == "apply_patch")
        .unwrap();
    assert_eq!(patch.state, ToolState::Failed);
    assert_eq!(r.run.turns()[0].state, TurnState::Failed);
    let last = r.run.statuses().into_iter().last().unwrap();
    assert_eq!(last.tone, Tone::Error);
    assert!(!r.run.info.busy);
}

#[test]
fn requests_trace_doesnt_show_are_answered_at_once() {
    let mut r = Replay::new(settings(None, None, None), None);
    r.unsent.clear();
    r.feed(r#"{"method":"attestation/generate","id":7,"params":{}}"#);
    r.feed(r#"{"method":"item/tool/call","id":8,"params":{}}"#);
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(sent[0]["id"], 7);
    assert_eq!(sent[0]["error"]["code"], -32601);
    assert_eq!(
        sent[1],
        json!({"id": 8, "result": {"contentItems": [], "success": false}})
    );
}

fn approve() -> Answer {
    Answer::Approval {
        option_id: "accept".into(),
        note: None,
    }
}

#[test]
fn a_steer_refused_mid_turn_waits_for_the_next_turn() {
    let mut r = Replay::new(settings(None, None, None), None);
    r.feed(INIT_OK);
    r.feed(&thread_ok(1));
    r.unsent.clear();
    r.run.take(r.tr.send("one", &[], text("one")));
    r.feed(r#"{"id":2,"result":{"turn":{"id":"t1"}}}"#);
    let sent = r.run.take(r.tr.send("two", &[], text("two")));
    assert_eq!(methods(&sent), ["turn/steer"]);
    r.feed(r#"{"id":3,"error":{"code":-32600,"message":"turn is finishing"}}"#);
    assert!(
        r.unsent.is_empty(),
        "no retry while t1 runs: {:?}",
        r.unsent
    );
    r.feed(r#"{"method":"turn/completed","params":{"turn":{"id":"t1","status":"completed"}}}"#);
    let sent: Vec<Value> = r.unsent.drain(..).collect();
    assert_eq!(methods(&sent), ["turn/start"]);
    assert_eq!(sent[0]["params"]["input"], json!(text("two")));
}
