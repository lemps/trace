//! The real `codex app-server`, end to end through the adapter: a turn with a
//! file-change approval answered, an interrupt, and resuming the thread. Costs a few tokens and needs a
//! logged-in CLI, so it's ignored by default:
//! `cargo test --lib codex::smoke -- --ignored`. `TRACE_SMOKE_DIR` picks the
//! parent folder of the throwaway workspace (the temp dir otherwise), and
//! `TRACE_SMOKE_CODEX_MODEL` the model.

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use super::CodexAdapter;
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
        match rx.recv_timeout(Duration::from_secs(180)) {
            Ok(Seen::Row(row)) if f(&row) => return *row,
            Ok(Seen::Row(row)) => {
                if let JournalBody::Status(s) = &row.body {
                    eprintln!("status: {}", s.text);
                }
            }
            Ok(Seen::Exited) => panic!("codex exited"),
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
fn a_real_codex_turn_approval_and_interrupt() {
    let parent = std::env::var_os("TRACE_SMOKE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let dir = parent.join(format!("trace-codex-smoke-{}", crate::helpers::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let workspace_id = format!("smoke-{}", crate::helpers::new_id());
    let model = std::env::var("TRACE_SMOKE_CODEX_MODEL").unwrap_or("gpt-5.6-luna".into());
    let (tx, rx) = channel();
    let spec = LaunchSpec {
        workspace_id: workspace_id.clone(),
        cwd: dir.clone(),
        model: Some(model),
        resume: None,
        // A read-only sandbox makes every edit ask.
        extra_args: ["-a", "untrusted", "-s", "read-only"]
            .map(String::from)
            .to_vec(),
        env: vec![],
        next_seq: 0,
        options: Default::default(),
        tools: None,
    };
    let mut agent = CodexAdapter::launch(spec.clone(), Arc::new(Collect(Mutex::new(tx)))).unwrap();
    let say = |text: &str| UserMessage {
        text: text.into(),
        attachments: vec![],
    };

    agent
        .send(say(
            "Create a.txt containing hi using apply_patch. Reply in three words.",
        ))
        .unwrap();
    let approval = wait_for(&rx, |r| matches!(r.body, JournalBody::Approval(_)));
    let JournalBody::Approval(a) = approval.body else {
        unreachable!()
    };
    assert_eq!(a.tool, "apply_patch");
    let allow = Answer::Approval {
        option_id: "accept".into(),
        note: None,
    };
    agent.answer(&a.request_id, allow).unwrap();
    wait_for(&rx, |r| matches!(r.body, JournalBody::Diff(_)));
    let ended = wait_for(&rx, |r| turn_ended(r).is_some());
    assert_eq!(turn_ended(&ended), Some(TurnState::Completed));
    assert_eq!(
        std::fs::read_to_string(dir.join("a.txt")).unwrap().trim(),
        "hi"
    );

    agent
        .send(say("Write a 600-word story about a lighthouse. No tools."))
        .unwrap();
    wait_for(
        &rx,
        |r| matches!(&r.body, JournalBody::Message(m) if m.streaming),
    );
    agent.interrupt().unwrap();
    let ended = wait_for(&rx, |r| turn_ended(r).is_some());
    assert_eq!(turn_ended(&ended), Some(TurnState::Interrupted));

    stop(agent, &rx);

    // Started again, the agent resumes its saved thread.
    let (tx, rx) = channel();
    let mut agent = CodexAdapter::launch(spec, Arc::new(Collect(Mutex::new(tx)))).unwrap();
    agent
        .send(say(
            "Which file did you create earlier? Answer with just its name.",
        ))
        .unwrap();
    let answer = wait_for(
        &rx,
        |r| matches!(&r.body, JournalBody::Message(m) if m.role == Role::Assistant && !m.streaming),
    );
    let JournalBody::Message(m) = answer.body else {
        unreachable!()
    };
    assert!(m.text.contains("a.txt"), "{}", m.text);
    stop(agent, &rx);
    let _ = super::threads::forget(&workspace_id);
    let _ = std::fs::remove_dir_all(dir);
}

fn stop(mut agent: CodexAdapter, rx: &Receiver<Seen>) {
    agent.stop();
    loop {
        match rx.recv_timeout(Duration::from_secs(30)) {
            Ok(Seen::Exited) => return,
            Ok(Seen::Row(_)) => {}
            Err(e) => panic!("didn't exit: {e}"),
        }
    }
}
