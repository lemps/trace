//! The translator against frames recorded from a real `codex app-server`
//! (codex-cli 0.147.0, gpt-5.6-luna, scrubbed: the folder is `C:/dev/demo`).
//! `question.jsonl` is hand-made from the schema; see each fixture's header.

mod lifecycle;
mod replay;

use crate::agent_session::journal::*;
use replay::{replay, settings};

const FILES: &str = include_str!("../fixtures/turn_and_files.jsonl");
const DENY: &str = include_str!("../fixtures/deny.jsonl");
const INTERRUPT: &str = include_str!("../fixtures/interrupt.jsonl");
const ERROR: &str = include_str!("../fixtures/error.jsonl");
const QUESTION: &str = include_str!("../fixtures/question.jsonl");
const REASONING: &str = include_str!("../fixtures/reasoning.jsonl");

fn untrusted() -> super::args::ThreadSettings {
    settings(Some("untrusted"), Some("read-only"), Some("gpt-5.6-luna"))
}

#[test]
fn a_full_turn_streams_its_answer_and_ends_with_usage() {
    let r = replay(FILES, untrusted());
    let run = &r.run;
    let answers: Vec<&str> = run
        .messages()
        .into_iter()
        .filter(|(role, _)| *role == Role::Assistant)
        .map(|(_, t)| t)
        .collect();
    assert_eq!(
        answers,
        [
            "Created `notes.txt` with `alpha` and ran `echo hi`.",
            "Updated, then deleted."
        ]
    );
    // The answer streamed as revisions of one row, the last one settled.
    let id = run
        .sorted()
        .into_iter()
        .find(|r| matches!(&r.body, JournalBody::Message(m) if m.role == Role::Assistant))
        .unwrap()
        .id
        .clone();
    let pieces: Vec<&JournalRow> = run.revisions.iter().filter(|r| r.id == id).collect();
    assert!(pieces.len() > 2);
    assert!(matches!(&pieces[0].body, JournalBody::Message(m) if m.streaming));
    assert!(matches!(&pieces.last().unwrap().body, JournalBody::Message(m) if !m.streaming));
    // The user's own messages, once each (Codex's echo adds none).
    let users = run
        .messages()
        .iter()
        .filter(|(r, _)| *r == Role::User)
        .count();
    assert_eq!(users, 2);
    let turns = run.turns();
    assert_eq!(turns.len(), 2);
    assert!(turns.iter().all(|t| t.state == TurnState::Completed));
    assert_eq!(turns[0].duration_ms, Some(47917));
    // The sum of the turn's five requests' `last` usage.
    let u = turns[0].usage.as_ref().unwrap();
    assert_eq!(u.input_tokens + u.cache_read_tokens, 69968);
    assert_eq!(u.cache_read_tokens, 61824);
    assert_eq!(u.output_tokens, 252);
    assert_eq!(u.cost_usd, None);
    assert!(!run.info.busy);
}

#[test]
fn the_thread_model_and_limits_fill_the_session_info() {
    let info = replay(FILES, untrusted()).run.info;
    assert_eq!(info.agent, "codex");
    assert_eq!(info.model.as_deref(), Some("gpt-5.6-luna"));
    assert_eq!(
        info.conversation_id.as_deref(),
        Some("01a1b60b-9f67-78b1-90f7-458bc09593f7")
    );
    assert_eq!(info.limits.len(), 1);
    assert_eq!(info.limits[0].name, "seven_day");
    assert_eq!(info.limits[0].utilization, 0.0);
    assert_eq!(info.limits[0].resets_at, Some(1_794_660_380));
}

#[test]
fn a_command_is_a_shell_tool_with_its_output() {
    let run = replay(FILES, untrusted()).run;
    let shell: Vec<&ToolCall> = run
        .tools()
        .into_iter()
        .filter(|t| t.name == "shell")
        .collect();
    assert_eq!(shell.len(), 1);
    assert_eq!(shell[0].input["command"], "echo hi");
    assert_eq!(shell[0].input["cwd"], "C:\\dev\\demo");
    assert_eq!(shell[0].state, ToolState::Completed);
    assert_eq!(shell[0].output.as_deref(), Some("hi\r\n"));
}

#[test]
fn file_changes_are_patch_tools_with_a_diff_each() {
    let run = replay(FILES, untrusted()).run;
    let patches: Vec<&ToolCall> = run
        .tools()
        .into_iter()
        .filter(|t| t.name == "apply_patch")
        .collect();
    assert_eq!(patches.len(), 3);
    assert!(patches.iter().all(|t| t.state == ToolState::Completed));
    let first = patches[0].input["input"].as_str().unwrap();
    assert!(
        first.contains("*** Add File: C:\\dev\\demo\\notes.txt\nalpha\n"),
        "{first}"
    );
    let diffs: Vec<&FileDiff> = run
        .bodies()
        .into_iter()
        .filter_map(|b| match b {
            JournalBody::Diff(d) => Some(d),
            _ => None,
        })
        .collect();
    let kinds: Vec<ChangeKind> = diffs.iter().map(|d| d.change).collect();
    assert_eq!(
        kinds,
        [ChangeKind::Add, ChangeKind::Edit, ChangeKind::Delete]
    );
    assert!(diffs.iter().all(|d| d.path == "C:\\dev\\demo\\notes.txt"));
    assert_eq!(diffs[0].after.as_deref(), Some("alpha\n"));
    assert_eq!(
        diffs[1].patch.as_deref(),
        Some("@@ -1 +1 @@\n-alpha\n+beta\n")
    );
    assert_eq!(diffs[2].before.as_deref(), Some("beta\n"));
    assert_eq!(
        diffs[0].call_id.as_deref(),
        Some(patches[0].call_id.as_str())
    );
}

#[test]
fn a_file_change_approval_shows_the_patch_and_is_answered() {
    let run = replay(FILES, untrusted()).run;
    let approvals = run.approvals();
    assert_eq!(approvals.len(), 3);
    let a = approvals[0];
    assert_eq!(a.tool, "apply_patch");
    assert_eq!(a.title, "Edit C:\\dev\\demo\\notes.txt");
    assert!(a.detail.as_deref().unwrap().contains("*** Add File:"));
    let options: Vec<(&str, ApprovalKind)> =
        a.options.iter().map(|o| (o.id.as_str(), o.kind)).collect();
    assert_eq!(
        options,
        [
            ("accept", ApprovalKind::AllowOnce),
            ("acceptForSession", ApprovalKind::AllowAlways),
            ("decline", ApprovalKind::Deny),
            ("cancel", ApprovalKind::Deny),
        ]
    );
    let accepted = Resolution::Answered {
        answer: Answer::Approval {
            option_id: "accept".into(),
            note: None,
        },
    };
    assert!(approvals
        .iter()
        .all(|a| a.resolution.as_ref() == Some(&accepted)));
}

#[test]
fn plan_updates_are_a_plan_row() {
    let run = replay(FILES, untrusted()).run;
    let plans: Vec<&Plan> = run
        .bodies()
        .into_iter()
        .filter_map(|b| match b {
            JournalBody::Plan(p) => Some(p),
            _ => None,
        })
        .collect();
    assert_eq!(plans.len(), 1);
    let items: Vec<(&str, PlanStatus)> = plans[0]
        .items
        .iter()
        .map(|i| (i.text.as_str(), i.status))
        .collect();
    assert_eq!(
        items,
        [
            ("create file", PlanStatus::InProgress),
            ("run echo", PlanStatus::Pending)
        ]
    );
}

#[test]
fn a_declined_command_offers_what_codex_offers_and_fails_once() {
    let run = replay(DENY, untrusted()).run;
    let a = run.approvals()[0];
    assert_eq!(a.tool, "shell");
    assert_eq!(a.title, "Run mkdir x1");
    let options: Vec<(&str, &str)> = a
        .options
        .iter()
        .map(|o| (o.id.as_str(), o.label.as_str()))
        .collect();
    assert_eq!(
        options,
        [
            ("accept", "Allow once"),
            ("amend:1", "Always allow `mkdir x1`"),
            ("decline", "Deny"),
            ("cancel", "Deny and stop"),
        ]
    );
    // Codex reports the declined command twice; it stays one row.
    let tools = run.tools();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].state, ToolState::Failed);
    assert_eq!(
        tools[0].output.as_deref(),
        Some("exec command rejected by user")
    );
    assert_eq!(run.turns()[0].state, TurnState::Completed);
}

#[test]
fn an_interrupted_turn_ends_interrupted_and_the_next_one_runs() {
    let run = replay(INTERRUPT, settings(None, None, Some("gpt-5.6-luna"))).run;
    let states: Vec<TurnState> = run.turns().iter().map(|t| t.state).collect();
    assert_eq!(states, [TurnState::Interrupted, TurnState::Completed]);
    assert!(!run
        .bodies()
        .iter()
        .any(|b| matches!(b, JournalBody::Message(m) if m.streaming)));
    assert!(run.statuses().is_empty());
    assert_eq!(run.messages().last().unwrap().1, "ok");
}

#[test]
fn a_turn_error_is_one_status_and_a_failed_turn() {
    let run = replay(ERROR, settings(None, None, Some("no-such-model-xyz"))).run;
    let errors: Vec<&str> = run
        .statuses()
        .into_iter()
        .filter(|s| s.tone == Tone::Error)
        .map(|s| s.text.as_str())
        .collect();
    assert_eq!(
        errors,
        ["The 'no-such-model-xyz' model is not supported when using Codex with a ChatGPT account."]
    );
    let warnings = run
        .statuses()
        .iter()
        .filter(|s| s.tone == Tone::Warning)
        .count();
    assert_eq!(warnings, 1);
    assert_eq!(run.turns()[0].state, TurnState::Failed);
}

#[test]
fn request_user_input_is_a_question_answered_by_id() {
    let run = replay(QUESTION, settings(None, None, None)).run;
    let JournalBody::Question(set) = run
        .bodies()
        .into_iter()
        .find(|b| matches!(b, JournalBody::Question(_)))
        .unwrap()
    else {
        unreachable!()
    };
    let q = &set.questions[0];
    assert_eq!(
        (q.id.as_str(), q.header.as_deref()),
        ("color", Some("Color"))
    );
    assert_eq!(q.text, "Which color do you prefer?");
    let labels: Vec<&str> = q.options.iter().map(|o| o.label.as_str()).collect();
    assert_eq!(labels, ["Red", "Blue"]);
    assert_eq!(q.options[0].description.as_deref(), Some("Warm"));
    assert_eq!(q.options[1].description, None);
    assert!(q.allow_free_text);
    assert!(matches!(set.resolution, Some(Resolution::Answered { .. })));
    let u = run.turns()[0].usage.clone().unwrap();
    assert_eq!(
        (u.input_tokens, u.cache_read_tokens, u.output_tokens),
        (60, 40, 20)
    );
}

#[test]
fn reasoning_summaries_are_a_reasoning_message() {
    let run = replay(REASONING, settings(None, None, Some("gpt-5.6-luna"))).run;
    let reasoning: Vec<&str> = run
        .messages()
        .into_iter()
        .filter(|(r, _)| *r == Role::Reasoning)
        .map(|(_, t)| t)
        .collect();
    assert_eq!(reasoning, ["**Confirming 391 is composite**"]);
}
