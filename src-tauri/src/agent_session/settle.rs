//! Rows an agent left open when its process went away without settling them
//! (trace quit or crashed mid-turn). Nobody can answer that prompt or finish that
//! tool any more, so a journal read back while no agent runs shows them ended,
//! as the adapter would have had the process exited normally.

use super::journal::{JournalBody, JournalRow, Resolution, SubagentState, ToolState, TurnState};

/// The next revision of each row in `rows` that's still open.
pub fn settle(rows: &[JournalRow]) -> Vec<JournalRow> {
    rows.iter()
        .filter_map(|row| {
            let mut body = row.body.clone();
            let changed = match &mut body {
                JournalBody::Message(m) if m.streaming => {
                    m.streaming = false;
                    true
                }
                JournalBody::Tool(t)
                    if t.state == ToolState::Running
                        || t.subagent.as_ref().is_some_and(|s| s.is_running()) =>
                {
                    if t.state == ToolState::Running {
                        t.state = ToolState::Failed;
                        t.output.get_or_insert_with(|| "Interrupted.".to_string());
                    }
                    // A background subagent outlives its call, not its agent.
                    if let Some(s) = t.subagent.as_mut().filter(|s| s.is_running()) {
                        s.state = SubagentState::Stopped;
                    }
                    true
                }
                JournalBody::Approval(a) if a.resolution.is_none() => {
                    a.resolution = Some(Resolution::Cancelled);
                    true
                }
                JournalBody::Question(q) if q.resolution.is_none() => {
                    q.resolution = Some(Resolution::Cancelled);
                    true
                }
                JournalBody::Turn(t) if t.state == TurnState::Running => {
                    t.state = TurnState::Interrupted;
                    true
                }
                _ => false,
            };
            changed.then(|| JournalRow {
                revision: row.revision + 1,
                body,
                ..row.clone()
            })
        })
        .collect()
}

/// `rows` with [`settle`]'s revisions applied in place.
pub fn settled(mut rows: Vec<JournalRow>) -> Vec<JournalRow> {
    for next in settle(&rows) {
        if let Some(row) = rows.iter_mut().find(|r| r.id == next.id) {
            *row = next;
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::journal::{ToolCall, Turn};

    fn row(id: &str, body: JournalBody) -> JournalRow {
        JournalRow {
            id: id.into(),
            revision: 3,
            seq: 0,
            at: 0,
            turn_id: None,
            body,
        }
    }

    #[test]
    fn open_rows_end_and_finished_ones_are_left_alone() {
        let running = row(
            "tool:1",
            JournalBody::Tool(ToolCall {
                call_id: "1".into(),
                name: "Bash".into(),
                input: serde_json::Value::Null,
                state: ToolState::Running,
                output: None,
                parent_call_id: None,
                subagent: None,
            }),
        );
        let done = row(
            "turn:a",
            JournalBody::Turn(Turn {
                turn_id: "a".into(),
                state: TurnState::Completed,
                duration_ms: None,
                usage: None,
            }),
        );
        let next = settle(&[running, done.clone()]);
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].revision, 4);
        match &next[0].body {
            JournalBody::Tool(t) => assert_eq!(t.state, ToolState::Failed),
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(settled(vec![done.clone()]), vec![done]);
    }

    #[test]
    fn a_background_subagent_stops_with_its_agent() {
        use crate::agent_session::journal::Subagent;
        let launched = row(
            "tool:2",
            JournalBody::Tool(ToolCall {
                call_id: "2".into(),
                name: "Agent".into(),
                input: serde_json::Value::Null,
                state: ToolState::Completed,
                output: Some("Async agent launched".into()),
                parent_call_id: None,
                subagent: Some(Box::new(Subagent::running(None, None, true))),
            }),
        );
        let next = settle(&[launched]);
        let JournalBody::Tool(t) = &next[0].body else {
            panic!("not a tool")
        };
        assert_eq!(t.state, ToolState::Completed);
        assert_eq!(t.subagent.as_ref().unwrap().state, SubagentState::Stopped);
    }
}
