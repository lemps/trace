//! The real `claude`, end to end through the adapter: a turn, an approval
//! answered, an interrupt. Costs a few haiku tokens and needs a logged-in CLI,
//! so it's ignored by default: `cargo test --lib smoke -- --ignored`.

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::ClaudeAdapter;
use crate::agent_session::journal::*;
use crate::agent_session::{AgentAdapter, JournalSink, LaunchSpec, SessionInfo, UserMessage};

enum Seen {
    Row(Box<JournalRow>),
    Exited,
}

struct Collect(Mutex<Sender<Seen>>);

impl JournalSink for Collect {
    fn row(&self, row: JournalRow) {
        let _ = self.0.lock().unwrap().send(Seen::Row(Box::new(row)));
    }
    fn info(&self, _info: SessionInfo) {}
    fn exited(&self, _reason: Option<String>) {
        let _ = self.0.lock().unwrap().send(Seen::Exited);
    }
}

/// Wait for a row matching `f`.
fn wait_for(rx: &Receiver<Seen>, f: impl Fn(&JournalRow) -> bool) -> JournalRow {
    loop {
        match rx.recv_timeout(Duration::from_secs(120)) {
            Ok(Seen::Row(row)) if f(&row) => return *row,
            Ok(Seen::Row(_)) => {}
            Ok(Seen::Exited) => panic!("claude exited"),
            Err(e) => panic!("timed out: {e}"),
        }
    }
}

fn turn_ended(row: &JournalRow) -> Option<TurnState> {
    match &row.body {
        JournalBody::Turn(t) if t.state != TurnState::Running => Some(t.state),
        _ => None,
    }
}

#[test]
#[ignore]
fn a_real_claude_turn_approval_and_interrupt() {
    let dir = std::env::temp_dir().join(format!("trace-chat-smoke-{}", crate::helpers::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let workspace_id = format!("smoke-{}", crate::helpers::new_id());
    let (tx, rx) = channel();
    let spec = LaunchSpec {
        workspace_id: workspace_id.clone(),
        cwd: dir.clone(),
        model: Some("haiku".into()),
        resume: None,
        extra_args: vec![],
        env: vec![],
        next_seq: 0,
    };
    let mut agent = ClaudeAdapter::launch(spec, Arc::new(Collect(Mutex::new(tx)))).unwrap();
    let say = |text: &str| UserMessage {
        text: text.into(),
        attachments: vec![],
    };

    agent
        .send(say(
            "Use the Write tool to create a.txt containing hi. Reply in three words.",
        ))
        .unwrap();
    let approval = wait_for(&rx, |r| matches!(r.body, JournalBody::Approval(_)));
    let JournalBody::Approval(a) = approval.body else {
        unreachable!()
    };
    let allow = Answer::Approval {
        option_id: "allow".into(),
        note: None,
    };
    agent.answer(&a.request_id, allow).unwrap();
    let ended = wait_for(&rx, |r| turn_ended(r).is_some());
    assert_eq!(turn_ended(&ended), Some(TurnState::Completed));
    assert_eq!(
        std::fs::read_to_string(dir.join("a.txt")).unwrap().trim(),
        "hi"
    );

    agent
        .send(say("Write a 400-word story about a lighthouse. No tools."))
        .unwrap();
    wait_for(
        &rx,
        |r| matches!(&r.body, JournalBody::Message(m) if m.streaming),
    );
    agent.interrupt().unwrap();
    let ended = wait_for(&rx, |r| turn_ended(r).is_some());
    assert_eq!(turn_ended(&ended), Some(TurnState::Interrupted));

    agent.stop();
    loop {
        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Seen::Exited) => break,
            Ok(Seen::Row(_)) => {}
            Err(e) => panic!("didn't exit: {e}"),
        }
    }
    let _ = crate::claude::conversations::forget_session_id(&workspace_id);
    let _ = std::fs::remove_dir_all(dir);
}
