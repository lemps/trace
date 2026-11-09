//! Replaying a recorded fixture through the translator, making each move the
//! recording made (`>>> ` lines) and checking the translator writes that line.

use std::collections::HashMap;

use serde_json::Value;

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
    pub fn take(&mut self, outs: Vec<Out>) -> Vec<Value> {
        let mut replies = Vec::new();
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
                Out::Reply(v) => replies.push(v),
                Out::Mcp { .. } => {}
            }
        }
        replies
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

    pub fn row(&self, id: &str) -> &JournalBody {
        &self
            .rows
            .get(id)
            .unwrap_or_else(|| panic!("no row {id}"))
            .body
    }
}

/// Replay a fixture up to (not including) the line containing `until`.
pub fn replay_until(tr: &mut Translator, run: &mut Run, fixture: &str, until: Option<&str>) {
    for line in fixture.lines() {
        if until.is_some_and(|u| line.contains(u)) {
            return;
        }
        if line.starts_with('#') || line.trim().is_empty() {
            continue;
        }
        let Some(sent) = line.strip_prefix(">>> ") else {
            let replies = run.take(tr.line(line));
            assert!(replies.is_empty(), "unexpected reply to {line}");
            continue;
        };
        let sent: Value = serde_json::from_str(sent).unwrap();
        let replies = match sent["type"].as_str() {
            Some("user") => {
                let text = sent["message"]["content"].as_str().unwrap();
                run.take(tr.send(text, &[], Value::String(text.to_string())))
            }
            Some("control_response") => {
                let request_id = sent["response"]["request_id"].as_str().unwrap();
                let answer = answer_like(run, request_id, &sent["response"]["response"]);
                run.take(tr.answer(request_id, answer).unwrap())
            }
            Some("control_request") => {
                let reply = tr.interrupt().expect("a turn to interrupt");
                assert_eq!(reply["request"], sent["request"]);
                continue;
            }
            other => panic!("unknown sent line {other:?}"),
        };
        assert_eq!(replies, vec![sent]);
    }
}

pub fn replay(fixture: &str) -> Run {
    let mut tr = Translator::new(0, || 0);
    let mut run = Run::default();
    replay_until(&mut tr, &mut run, fixture, None);
    run
}

/// The answer a user would have given to produce the recorded response.
pub fn answer_like(run: &Run, request_id: &str, decision: &Value) -> Answer {
    if decision["behavior"] == "deny" {
        let note = decision["message"].as_str().map(str::to_string);
        return Answer::Approval {
            option_id: "deny".into(),
            note,
        };
    }
    let Some(given) = decision["updatedInput"]["answers"].as_object() else {
        return Answer::Approval {
            option_id: "allow".into(),
            note: None,
        };
    };
    let JournalBody::Question(set) = run.row(&format!("question:{request_id}")) else {
        panic!("answers without a question row");
    };
    let answers = set
        .questions
        .iter()
        .filter_map(|q| {
            let chosen = given.get(&q.text)?.as_str()?;
            Some((
                q.id.clone(),
                chosen.split(", ").map(str::to_string).collect(),
            ))
        })
        .collect();
    Answer::Questions { answers }
}

pub fn message_text(body: &JournalBody) -> Option<(&Message, &str)> {
    match body {
        JournalBody::Message(m) => Some((m, m.text.as_str())),
        _ => None,
    }
}
