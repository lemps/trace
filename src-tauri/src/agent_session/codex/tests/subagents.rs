//! Codex's sub-agents against a recording: two spawned, each listing a folder
//! on its own thread, then waited for.

use super::replay::{replay, settings, Replay};
use crate::agent_session::journal::*;

const SPAWNED: &str = include_str!("../fixtures/subagents.jsonl");

fn run() -> Replay {
    replay(
        SPAWNED,
        settings(Some("never"), Some("read-only"), Some("gpt-5.6-luna")),
    )
}

#[test]
fn each_spawn_is_a_subagent_that_ends_with_its_report() {
    let r = run();
    let spawns: Vec<&ToolCall> = r
        .run
        .tools()
        .into_iter()
        .filter(|t| t.name == "spawn_agent")
        .collect();
    assert_eq!(spawns.len(), 2);
    let reports: Vec<Option<&str>> = spawns
        .iter()
        .map(|t| t.subagent.as_ref().unwrap().result.as_deref())
        .collect();
    assert_eq!(
        reports,
        [Some("one.txt\ntwo.txt"), Some("four.md\nthree.txt")]
    );
    for t in &spawns {
        let s = t.subagent.as_ref().unwrap();
        assert_eq!(s.state, SubagentState::Completed);
        assert!(s
            .description
            .as_deref()
            .unwrap()
            .starts_with("List the files in folder"));
        assert!(
            t.input["prompt"].as_str().is_some(),
            "the brief is the call's input"
        );
    }
    assert_eq!(r.run.info.running_subagents, 0);
}

#[test]
fn a_sub_agents_own_work_names_its_spawn() {
    let r = run();
    let tools = r.run.tools();
    let spawn_ids: Vec<&str> = tools
        .iter()
        .filter(|t| t.name == "spawn_agent")
        .map(|t| t.call_id.as_str())
        .collect();
    let shells: Vec<&ToolCall> = tools
        .iter()
        .copied()
        .filter(|t| t.name == "shell")
        .collect();
    assert_eq!(shells.len(), 2);
    for shell in &shells {
        let parent = shell.parent_call_id.as_deref().expect("a sub-agent's call");
        assert!(spawn_ids.contains(&parent));
    }
    // Their answers are theirs; the main agent's words have no parent.
    let theirs: Vec<&str> = r
        .run
        .bodies()
        .into_iter()
        .filter_map(|b| match b {
            JournalBody::Message(m) if m.parent_call_id.is_some() => Some(m.text.as_str()),
            _ => None,
        })
        .collect();
    assert!(theirs.contains(&"one.txt\ntwo.txt"));
    let main = r.run.messages();
    assert!(main.iter().any(|(_, t)| t.starts_with("a: one.txt")));
    // The waits are calls too; the sub-agents' turns opened no turn of ours.
    assert_eq!(tools.iter().filter(|t| t.name == "wait_agent").count(), 2);
    assert_eq!(r.run.turns().len(), 1);
    assert!(r
        .run
        .sorted()
        .iter()
        .all(|row| row.turn_id == r.run.sorted()[0].turn_id));
}

#[test]
fn a_running_sub_agent_can_be_interrupted_on_its_own() {
    let mut r = Replay::new(
        settings(Some("never"), Some("read-only"), Some("gpt-5.6-luna")),
        None,
    );
    // Up to the first sub-agent's command: both are spawned and running.
    r.until(SPAWNED, Some("\"type\":\"commandExecution\""));
    assert_eq!(r.run.info.running_subagents, 2);
    let spawn = r
        .run
        .tools()
        .into_iter()
        .find(|t| t.name == "spawn_agent")
        .unwrap()
        .call_id
        .clone();
    let outs = r.tr.stop_subagent(&spawn).unwrap();
    let sent = r.run.take(outs);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0]["method"], "turn/interrupt");
    assert_ne!(
        sent[0]["params"]["threadId"],
        r.run.info.conversation_id.clone().unwrap()
    );
}

#[test]
fn the_context_gauge_is_the_main_threads() {
    let r = run();
    let context = r.run.info.context.expect("a context from the token counts");
    // The main thread's last request; its sub-agents' (15,935) never land here.
    assert_eq!((context.used, context.window), (22384, 258400));
    assert!(!context.estimated);
}
