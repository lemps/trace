//! Replaying a recorded app-server session through the translator. Lines
//! starting `>>> ` are what the recording wrote to Codex: the replay makes the
//! same move (a message, an answer, an interrupt), checks the translator writes
//! that frame, and maps the recording's request ids onto the translator's so
//! Codex's responses find their requests.

use std::collections::{HashMap, VecDeque};

use serde_json::Value;

use super::super::args::ThreadSettings;
use super::super::translate::{Out, Translator};
use crate::agent_session::journal::*;
use crate::agent_session::SessionInfo;

#[derive(Default)]
pub struct Run {
    /// Every row revision, in the order they came out.
    pub revisions: Vec<JournalRow>,
    /// Each row's latest revision.
    pub rows: HashMap<String, JournalRow>,
    pub info: SessionInfo,
}

impl Run {
    /// Keep the rows and info; return the frames written to Codex.
    pub fn take(&mut self, outs: Vec<Out>) -> Vec<Value> {
        let mut sent = Vec::new();
        for out in outs {
            match out {
                Out::Row(row) => {
                    if let Some(prev) = self.rows.get(&row.id) {
                        assert!(row.revision > prev.revision, "{} went backwards", row.id);
                        assert_eq!(row.seq, prev.seq, "{} moved", row.id);
                    }
                    self.revisions.push(row.clone());
                    self.rows.insert(row.id.clone(), row);
                }
                Out::Info(info) => self.info = info,
                Out::Send(v) => sent.push(v),
            }
        }
        sent
    }

    pub fn sorted(&self) -> Vec<&JournalRow> {
        let mut rows: Vec<&JournalRow> = self.rows.values().collect();
        rows.sort_by_key(|r| r.seq);
        rows
    }

    pub fn bodies(&self) -> Vec<&JournalBody> {
        self.sorted().into_iter().map(|r| &r.body).collect()
    }

    pub fn tools(&self) -> Vec<&ToolCall> {
        self.bodies()
            .into_iter()
            .filter_map(|b| match b {
                JournalBody::Tool(t) => Some(t),
                _ => None,
            })
            .collect()
    }

    pub fn turns(&self) -> Vec<&Turn> {
        self.bodies()
            .into_iter()
            .filter_map(|b| match b {
                JournalBody::Turn(t) => Some(t),
                _ => None,
            })
            .collect()
    }

    pub fn approvals(&self) -> Vec<&Approval> {
        self.bodies()
            .into_iter()
            .filter_map(|b| match b {
                JournalBody::Approval(a) => Some(a),
                _ => None,
            })
            .collect()
    }

    pub fn statuses(&self) -> Vec<&Status> {
        self.bodies()
            .into_iter()
            .filter_map(|b| match b {
                JournalBody::Status(s) => Some(s),
                _ => None,
            })
            .collect()
    }

    /// Message rows' (role, text), in order.
    pub fn messages(&self) -> Vec<(Role, &str)> {
        self.bodies()
            .into_iter()
            .filter_map(|b| match b {
                JournalBody::Message(m) => Some((m.role, m.text.as_str())),
                _ => None,
            })
            .collect()
    }
}

/// A replay in progress: the translator, what it produced, and what it wrote
/// that the recording hasn't reached yet.
pub struct Replay {
    pub tr: Translator,
    pub run: Run,
    pub unsent: VecDeque<Value>,
    /// The recording's id for each of our requests → the translator's.
    ids: HashMap<String, Value>,
}

impl Replay {
    pub fn new(settings: ThreadSettings, resume: Option<String>) -> Self {
        let mut tr = Translator::new(0, || 0, settings, resume);
        let mut run = Run::default();
        let unsent = run.take(tr.start()).into();
        Self {
            tr,
            run,
            unsent,
            ids: HashMap::new(),
        }
    }

    /// Feed `fixture` up to (not including) the first line containing `until`.
    pub fn until(&mut self, fixture: &str, until: Option<&str>) {
        for line in fixture.lines() {
            if until.is_some_and(|u| line.contains(u)) {
                return;
            }
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }
            match line.strip_prefix(">>> ") {
                Some(sent) => self.expect(serde_json::from_str(sent).unwrap()),
                None => self.feed(line),
            }
        }
    }

    pub fn feed(&mut self, line: &str) {
        let mut frame: Value = serde_json::from_str(line).unwrap();
        if frame.get("method").is_none() {
            // A response to one of ours: give it the translator's id.
            if let Some(ours) = self.ids.get(&frame["id"].to_string()) {
                frame["id"] = ours.clone();
            }
        }
        let outs = self.tr.line(&frame.to_string());
        let sent = self.run.take(outs);
        self.unsent.extend(sent);
    }

    /// The recording wrote `expected`: make the move behind it, then check.
    fn expect(&mut self, expected: Value) {
        if self.unsent.is_empty() {
            let outs = match expected["method"].as_str() {
                Some("turn/start" | "turn/steer") => {
                    let input = expected["params"]["input"].as_array().unwrap().clone();
                    let text = input[0]["text"].as_str().unwrap().to_string();
                    self.tr.send(&text, &[], input)
                }
                Some("turn/interrupt") => self.tr.interrupt(),
                None => {
                    let (request_id, answer) = answer_like(&self.run, &expected["result"]);
                    self.tr.answer(&request_id, answer).unwrap()
                }
                Some(other) => panic!("the translator didn't send {other}"),
            };
            let sent = self.run.take(outs);
            self.unsent.extend(sent);
        }
        let got = self
            .unsent
            .pop_front()
            .unwrap_or_else(|| panic!("nothing sent for {expected}"));
        assert_eq!(got["method"], expected["method"], "sent {got}");
        match (expected.get("method"), expected.get("id")) {
            (Some(method), Some(id)) => {
                self.ids.insert(id.to_string(), got["id"].clone());
                match method.as_str() {
                    // Our client info names this build.
                    Some("initialize") => {}
                    // A recording may have asked for more (an effort) than trace does.
                    Some("turn/start") => {
                        for key in ["threadId", "input"] {
                            assert_eq!(got["params"][key], expected["params"][key], "{key}");
                        }
                    }
                    _ => assert_eq!(got["params"], expected["params"], "{method}"),
                }
            }
            _ => assert_eq!(got, expected),
        }
    }
}

pub fn replay(fixture: &str, settings: ThreadSettings) -> Replay {
    let mut r = Replay::new(settings, None);
    r.until(fixture, None);
    assert!(r.unsent.is_empty(), "sent but not recorded: {:?}", r.unsent);
    r
}

pub fn settings(
    approval: Option<&str>,
    sandbox: Option<&str>,
    model: Option<&str>,
) -> ThreadSettings {
    ThreadSettings {
        cwd: "C:/dev/demo".into(),
        model: model.map(str::to_string),
        approval_policy: approval.map(str::to_string),
        sandbox: sandbox.map(str::to_string),
    }
}

/// The open prompt the recorded response answered, and the answer that sends it.
fn answer_like(run: &Run, result: &Value) -> (String, Answer) {
    let open = run
        .sorted()
        .into_iter()
        .rev()
        .find_map(|r| match &r.body {
            JournalBody::Approval(a) if a.resolution.is_none() => Some(a.request_id.clone()),
            JournalBody::Question(q) if q.resolution.is_none() => Some(q.request_id.clone()),
            _ => None,
        })
        .expect("an open prompt");
    if let Some(decision) = result["decision"].as_str() {
        let answer = Answer::Approval {
            option_id: decision.to_string(),
            note: None,
        };
        return (open, answer);
    }
    let answers = result["answers"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(id, a)| {
            let given = a["answers"].as_array().unwrap();
            let given = given.iter().map(|g| g.as_str().unwrap().to_string());
            (id.clone(), given.collect())
        })
        .collect();
    (open, Answer::Questions { answers })
}
