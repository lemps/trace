use super::*;
use crate::agent_session::journal::{Plan, PlanStatus, ToolCall, Turn};
use serde_json::json;

fn row(body: JournalBody) -> JournalRow {
    JournalRow {
        id: "r".into(),
        revision: 1,
        seq: 1,
        at: 1,
        turn_id: None,
        body,
    }
}

fn tool(name: &str, input: Value, state: ToolState) -> JournalRow {
    row(JournalBody::Tool(ToolCall {
        call_id: "c1".into(),
        name: name.into(),
        input,
        state,
        output: None,
        parent_call_id: None,
        subagent: None,
    }))
}

const PLAN_PATH: &str = r"C:\Users\me\.claude\plans\shiny-plan.md";

fn run(finds: Vec<Found>, file: Option<&str>) -> Effects {
    let mut tracker = Tracker::default();
    let mut out = Effects::default();
    let read = |_: &Path| file.map(str::to_string);
    for f in finds {
        tracker.apply(f, &mut out, &read);
    }
    out
}

#[test]
fn exit_plan_mode_in_the_journal_is_a_plan_mode_document() {
    let found = from_row(&tool(
        "ExitPlanMode",
        json!({"plan": "# Ship it\n1. a"}),
        ToolState::Running,
    ));
    let out = run(found.into_iter().collect(), None);
    assert_eq!(out.docs.len(), 1);
    let doc = &out.docs[0];
    assert_eq!(doc.series, PLAN_MODE_SERIES);
    assert_eq!(doc.title, "Ship it");
    assert_eq!(doc.reference.as_deref(), Some("call:c1"));
    assert_eq!(doc.source, PlanSource::PlanMode);
}

#[test]
fn without_a_plan_in_its_input_exit_plan_mode_reads_the_plan_file() {
    let finds = vec![
        from_row(&tool(
            "Write",
            json!({"file_path": PLAN_PATH, "content": "x"}),
            ToolState::Completed,
        ))
        .unwrap(),
        from_row(&tool("ExitPlanMode", json!({}), ToolState::Running)).unwrap(),
        Found::TurnEnd,
    ];
    let out = run(finds, Some("# From the file"));
    // Once: the turn's end has nothing left to record.
    assert_eq!(out.docs.len(), 1);
    assert_eq!(out.docs[0].body, "# From the file");
}

#[test]
fn a_plan_file_written_in_a_turn_without_exit_plan_mode_is_kept_at_its_end() {
    let running = tool("Edit", json!({"file_path": PLAN_PATH}), ToolState::Running);
    assert_eq!(from_row(&running), None, "only a finished edit counts");
    let done = tool(
        "Edit",
        json!({"file_path": PLAN_PATH}),
        ToolState::Completed,
    );
    let turn = row(JournalBody::Turn(Turn {
        turn_id: "t".into(),
        state: TurnState::Completed,
        duration_ms: None,
        usage: None,
    }));
    let out = run(
        vec![from_row(&done).unwrap(), from_row(&turn).unwrap()],
        Some("draft"),
    );
    assert_eq!(out.docs.len(), 1);
    assert_eq!(out.docs[0].reference, None);
}

#[test]
fn other_files_and_tools_are_not_plans() {
    assert!(!is_plan_file("/repo/docs/plans/x.md"));
    assert!(!is_plan_file("/home/me/.claude/plans/x.txt"));
    assert!(is_plan_file("/home/me/.claude/plans/x.md"));
    assert_eq!(
        from_row(&tool(
            "Write",
            json!({"file_path": "/repo/a.md"}),
            ToolState::Completed
        )),
        None
    );
    assert_eq!(
        from_row(&tool(
            "Bash",
            json!({"command": "ls"}),
            ToolState::Completed
        )),
        None
    );
}

#[test]
fn journal_plan_rows_are_the_task_list() {
    let items = vec![PlanItem {
        text: "a".into(),
        status: PlanStatus::InProgress,
    }];
    let found = from_row(&row(JournalBody::Plan(Plan {
        items: items.clone(),
    })));
    let out = run(found.into_iter().collect(), None);
    assert_eq!(out.tasks, Some(items));
    assert!(out.docs.is_empty());
}

#[test]
fn transcript_lines_give_plans_files_and_todos() {
    let exit = json!({"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Here's the plan"},
        {"type": "tool_use", "id": "toolu_1", "name": "ExitPlanMode", "input": {"plan": "# P\nstep"}}
    ]}});
    assert_eq!(
        from_transcript_line(&exit.to_string()),
        vec![Found::ExitPlan {
            reference: Some("call:toolu_1".into()),
            plan: Some("# P\nstep".into())
        }]
    );
    let todo = json!({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "id": "t2", "name": "TodoWrite", "input": {"todos": [
            {"content": "one", "status": "completed"}, {"content": "two", "status": "pending"}
        ]}}
    ]}});
    match &from_transcript_line(&todo.to_string())[..] {
        [Found::Tasks(items)] => {
            assert_eq!(items.len(), 2);
            assert_eq!(items[0].status, PlanStatus::Done);
        }
        other => panic!("{other:?}"),
    }
    let write = json!({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "id": "t3", "name": "Write", "input": {"file_path": "/h/.claude/plans/a.md", "content": "x"}}
    ]}});
    assert_eq!(
        from_transcript_line(&write.to_string()),
        vec![Found::PlanFile("/h/.claude/plans/a.md".into())]
    );
    let result = json!({"type": "user", "message": {"content": [
        {"type": "tool_result", "tool_use_id": "toolu_1", "content": "ok"}
    ]}, "toolUseResult": {"plan": "# P\nstep", "isAgent": false}});
    assert_eq!(
        from_transcript_line(&result.to_string()),
        vec![Found::ExitPlan {
            reference: Some("call:toolu_1".into()),
            plan: Some("# P\nstep".into())
        }]
    );
}

#[test]
fn subagent_lines_and_noise_are_skipped() {
    let side = json!({"type": "assistant", "isSidechain": true, "message": {"content": [
        {"type": "tool_use", "id": "x", "name": "ExitPlanMode", "input": {"plan": "p"}}
    ]}});
    assert!(from_transcript_line(&side.to_string()).is_empty());
    assert!(from_transcript_line("not json but ExitPlanMode").is_empty());
    assert!(from_transcript_line(r#"{"type":"assistant"}"#).is_empty());
}

#[test]
fn a_plan_written_alongside_exit_plan_mode_is_taken_once_the_write_lands() {
    // Claude 2.1.319 rewrote the plan file and called ExitPlanMode in one message:
    // the call's input still had the old plan, read from the file before the write.
    let finds = vec![
        Found::ExitPlan {
            reference: Some("call:c2".into()),
            plan: Some("old".into()),
        },
        from_row(&tool(
            "Write",
            json!({"file_path": PLAN_PATH}),
            ToolState::Completed,
        ))
        .unwrap(),
        Found::TurnEnd,
    ];
    let out = run(finds, Some("new"));
    let bodies: Vec<_> = out.docs.iter().map(|d| d.body.as_str()).collect();
    assert_eq!(bodies, vec!["old", "new"]);
}

#[test]
fn a_terminal_agents_plan_dialog_carries_its_plan() {
    let input = json!({"hook_event_name": "PermissionRequest", "tool_name": "ExitPlanMode",
        "tool_input": {"plan": "# Shout
1. a", "planFilePath": "x"}});
    let out = run(from_permission(&input).into_iter().collect(), None);
    assert_eq!(out.docs.len(), 1);
    assert_eq!(out.docs[0].title, "Shout");
    assert_eq!(
        from_permission(&json!({"tool_name": "Bash", "tool_input": {}})),
        None
    );
}
