//! Subagents against recorded stream-json: two in parallel, one in the
//! background finishing after its turn, and an interrupt that stops them.

use super::replay::{replay, replay_until, Run};
use crate::agent_session::claude::translate::Translator;
use crate::agent_session::journal::*;

const PARALLEL: &str = include_str!("../fixtures/subagents.jsonl");
const BACKGROUND: &str = include_str!("../fixtures/background_subagent.jsonl");
const INTERRUPTED: &str = include_str!("../fixtures/subagent_interrupt.jsonl");

/// The Agent calls, in order.
fn agents(run: &Run) -> Vec<(&JournalRow, &ToolCall, &Subagent)> {
    run.sorted()
        .into_iter()
        .filter_map(|r| match &r.body {
            JournalBody::Tool(t) => t.subagent.as_deref().map(|s| (r, t, s)),
            _ => None,
        })
        .collect()
}

/// Rows a subagent made: (row, its parent).
fn children(run: &Run) -> Vec<(&JournalRow, &str)> {
    run.sorted()
        .into_iter()
        .filter_map(|r| {
            let parent = match &r.body {
                JournalBody::Tool(t) => t.parent_call_id.as_deref(),
                JournalBody::Message(m) => m.parent_call_id.as_deref(),
                _ => None,
            };
            parent.map(|p| (r, p))
        })
        .collect()
}

#[test]
fn parallel_subagents_carry_their_kind_job_and_report() {
    let run = replay(PARALLEL);
    let found = agents(&run);
    assert_eq!(found.len(), 2);
    for (_, call, s) in &found {
        assert_eq!(call.name, "Agent");
        assert_eq!(call.state, ToolState::Completed);
        assert_eq!(s.agent_type.as_deref(), Some("Explore"));
        assert_eq!(s.state, SubagentState::Completed);
        assert!(!s.background);
        assert_eq!(s.tool_uses, Some(1));
        assert!(s.duration_ms.is_some());
    }
    assert_eq!(
        found[0].2.description.as_deref(),
        Some("List files in folder a")
    );
    // The report is the subagent's own words, without Claude's hand-back frame.
    assert_eq!(
        found[1].2.result.as_deref(),
        Some("b\\four.md\nb\\three.txt")
    );
    // So is the call's own output, which the main agent was handed in the frame.
    assert_eq!(
        found[1].1.output.as_deref(),
        Some("b\\four.md\nb\\three.txt")
    );
    assert!(found
        .iter()
        .all(|(_, c, _)| !c.output.as_deref().unwrap_or("").contains("hand-back")));
    assert_eq!(run.info.running_subagents, 0);
}

#[test]
fn a_subagents_calls_name_it_and_stay_in_its_turn() {
    let run = replay(PARALLEL);
    let found = agents(&run);
    let kids = children(&run);
    let globs: Vec<&str> = kids.iter().map(|(_, p)| *p).collect();
    assert_eq!(
        globs,
        [found[0].1.call_id.as_str(), found[1].1.call_id.as_str()]
    );
    for (row, _) in &kids {
        assert_eq!(row.turn_id, found[0].0.turn_id);
    }
    // The brief (the subagent's user message) is the call's input, not a row.
    assert!(run.bodies().iter().all(|b| !matches!(b,
        JournalBody::Message(m) if m.role == Role::User && m.parent_call_id.is_some())));
    // One turn: the subagents never opened one of their own.
    assert_eq!(run.turns().len(), 1);
}

#[test]
fn both_count_as_running_until_each_reports() {
    let mut tr = Translator::new(0, || 0);
    let mut run = Run::default();
    replay_until(
        &mut tr,
        &mut run,
        PARALLEL,
        Some("\"subtype\":\"task_notification\""),
    );
    assert_eq!(run.info.running_subagents, 2);
    assert!(agents(&run).iter().all(|(_, _, s)| s.is_running()));
    // `task_progress` said what each was doing.
    assert_eq!(agents(&run)[0].2.activity.as_deref(), Some("Finding **/*"));
}

#[test]
fn a_background_subagent_outlives_its_turn_and_finishes_in_place() {
    let mut tr = Translator::new(0, || 0);
    let mut run = Run::default();
    // Up to the subagent's first line after the turn's result, then the rest.
    let first = "\"parent_tool_use_id\":\"toolu_016J74gySeeKkxayf3z1n1pd\"";
    let at = BACKGROUND.find(first).unwrap();
    let at = BACKGROUND[..at].rfind('\n').unwrap() + 1;
    let (head, tail) = BACKGROUND.split_at(at);
    replay_until(&mut tr, &mut run, head, None);
    let (row, call, s) = agents(&run)[0];
    let turn = row.turn_id.clone();
    assert_eq!(call.state, ToolState::Completed, "the call returns at once");
    assert!(s.background && s.is_running());
    assert!(!run.info.busy, "the turn is over");
    assert_eq!(run.info.running_subagents, 1, "but the agent still works");

    replay_until(&mut tr, &mut run, tail, None);
    let (_, _, s) = agents(&run)[0];
    assert_eq!(s.state, SubagentState::Completed);
    assert!(s.result.as_deref().unwrap().starts_with("I ran Glob"));
    let kids = children(&run);
    // Its sentence and both Globs, all filed under the turn that started it.
    let said: Vec<&str> = kids
        .iter()
        .filter_map(|(r, _)| match &r.body {
            JournalBody::Message(m) => Some(m.text.as_str()),
            _ => None,
        })
        .collect();
    assert!(said[0].starts_with("I'll run Glob"), "{said:?}");
    assert_eq!(
        kids.iter()
            .filter(|(r, _)| matches!(r.body, JournalBody::Tool(_)))
            .count(),
        2
    );
    assert!(kids.iter().all(|(r, _)| r.turn_id == turn));
    // Claude's own turn once it finished is a turn of its own.
    assert_eq!(run.turns().len(), 2);
    assert_eq!(run.info.running_subagents, 0);
    assert!(!run.info.busy);
}

#[test]
fn an_interrupt_with_no_turn_stops_background_subagents() {
    // `replay` makes the recorded interrupt: possible with only subagents running.
    let run = replay(INTERRUPTED);
    let found = agents(&run);
    assert_eq!(found.len(), 2);
    for (_, _, s) in &found {
        assert_eq!(s.state, SubagentState::Stopped);
        assert_eq!(
            s.result, None,
            "a stopped task's summary is only its description"
        );
    }
    // Their pings never finished.
    let kids = children(&run);
    assert!(!kids.is_empty());
    for (row, _) in kids {
        if let JournalBody::Tool(t) = &row.body {
            assert_eq!(t.state, ToolState::Failed);
        }
    }
    assert_eq!(run.info.running_subagents, 0);
}

#[test]
fn one_subagent_stops_by_its_task() {
    let mut tr = Translator::new(0, || 0);
    let mut run = Run::default();
    replay_until(
        &mut tr,
        &mut run,
        INTERRUPTED,
        Some("\"subtype\":\"task_progress\""),
    );
    let call = agents(&run)[0].1.call_id.clone();
    let reply = tr.stop_subagent(&call).unwrap();
    assert_eq!(reply["request"]["subtype"], "stop_task");
    assert_eq!(reply["request"]["task_id"], "a1de406664259cef6");
    assert!(tr.stop_subagent("nobody").is_err());
}
