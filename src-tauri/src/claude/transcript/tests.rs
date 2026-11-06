use super::parse::line;
use super::{read_file, TranscriptItem};

fn kinds(jsonl: &str) -> Vec<TranscriptItem> {
    jsonl.lines().flat_map(line).collect()
}

#[test]
fn prompts_replies_and_tools_keep_their_shape() {
    let items = kinds(concat!(
        r#"{"type":"user","uuid":"u1","timestamp":"2026-11-06T09:00:00Z","message":{"content":"Fix the build"}}"#,
        "\n",
        r#"{"type":"assistant","uuid":"a1","message":{"content":[{"type":"thinking","thinking":"hm"},{"type":"text","text":"On it."}]}}"#,
        "\n",
        r#"{"type":"assistant","uuid":"a2","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"npm test"}}]}}"#,
        "\n",
        r#"{"type":"user","uuid":"u2","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":[{"type":"text","text":"1 failing"}],"is_error":true}]}}"#,
        "\n",
        r#"{"type":"system","uuid":"s1","subtype":"turn_duration","durationMs":4200}"#,
    ));
    assert_eq!(
        items,
        vec![
            TranscriptItem::Prompt {
                id: "u1".into(),
                text: "Fix the build".into(),
                at: Some("2026-11-06T09:00:00Z".into()),
            },
            TranscriptItem::Reply {
                id: "a1:1".into(),
                text: "On it.".into(),
                at: None,
            },
            TranscriptItem::ToolCall {
                id: "a2:0".into(),
                tool_use_id: "toolu_1".into(),
                name: "Bash".into(),
                input: serde_json::json!({ "command": "npm test" }),
                at: None,
            },
            TranscriptItem::ToolResult {
                id: "u2:0".into(),
                tool_use_id: "toolu_1".into(),
                text: "1 failing".into(),
                is_error: true,
            },
            TranscriptItem::TurnEnd {
                id: "s1".into(),
                duration_ms: 4200,
            },
        ]
    );
}

#[test]
fn harness_records_become_commands_and_notices_or_vanish() {
    let items = kinds(concat!(
        r#"{"type":"user","uuid":"m","isMeta":true,"message":{"content":"<local-command-caveat>ignore</local-command-caveat>"}}"#,
        "\n",
        r#"{"type":"user","uuid":"c","message":{"content":"<command-name>/compact</command-name>\n<command-message>compact</command-message>\n<command-args>keep tests</command-args>"}}"#,
        "\n",
        r#"{"type":"user","uuid":"o","message":{"content":"<local-command-stdout>\u001b[1mLogin\u001b[22m successful.</local-command-stdout>"}}"#,
        "\n",
        r#"{"type":"user","uuid":"t","message":{"content":"<task-notification>\n<task-id>x</task-id>\n<summary>Build finished</summary>\n</task-notification>"}}"#,
        "\n",
        r#"{"type":"user","uuid":"i","message":{"content":[{"type":"text","text":"[Request interrupted by user for tool use]"}]}}"#,
        "\n",
        r#"{"type":"user","uuid":"r","message":{"content":"<system-reminder>shh</system-reminder>"}}"#,
        "\n",
        r#"{"type":"system","uuid":"b","subtype":"compact_boundary","content":"Conversation compacted"}"#,
        "\n",
        r#"{"type":"user","uuid":"s","isCompactSummary":true,"message":{"content":"This session is being continued…"}}"#,
        "\n",
        r#"{"type":"assistant","uuid":"side","isSidechain":true,"message":{"content":[{"type":"text","text":"subagent"}]}}"#,
        "\n",
        r#"{"type":"queue-operation","operation":"enqueue"}"#,
        "\n",
        "not json\n",
    ));
    let shown: Vec<(&str, &str)> = items
        .iter()
        .map(|item| match item {
            TranscriptItem::Command { text, .. } => ("command", text.as_str()),
            TranscriptItem::Notice { text, .. } => ("notice", text.as_str()),
            _ => ("other", ""),
        })
        .collect();
    assert_eq!(
        shown,
        vec![
            ("command", "/compact keep tests"),
            ("notice", "Login successful."),
            ("notice", "Build finished"),
            ("notice", "Interrupted by you"),
            ("notice", "Conversation compacted"),
        ]
    );
}

#[test]
fn long_tool_inputs_are_clipped() {
    let big = "x".repeat(20_000);
    let raw = format!(
        r#"{{"type":"assistant","uuid":"a","message":{{"content":[{{"type":"tool_use","id":"t","name":"Write","input":{{"file_path":"a.txt","content":"{big}"}}}}]}}}}"#
    );
    let Some(TranscriptItem::ToolCall { input, .. }) = line(&raw).into_iter().next() else {
        panic!("expected a tool call");
    };
    let content = input["content"].as_str().unwrap_or_default();
    assert_eq!(content.chars().count(), super::MAX_TEXT + 1);
    assert!(content.ends_with('…'));
    assert_eq!(input["file_path"], "a.txt");
}

#[test]
fn reads_resume_from_the_offset_and_skip_a_half_written_line() {
    let dir = std::env::temp_dir().join(format!("trace-transcript-{}", crate::helpers::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("c.jsonl");
    let first = r#"{"type":"user","uuid":"u1","message":{"content":"one"}}"#;
    let second = r#"{"type":"user","uuid":"u2","message":{"content":"two"}}"#;
    // The second line is still being written: no newline yet.
    std::fs::write(&path, format!("{first}\n{}", &second[..10])).unwrap();

    let (offset, reset, items) = read_file(&path, 0, true).unwrap();
    assert!(reset);
    assert_eq!(items.len(), 1);
    assert_eq!(offset, first.len() as u64 + 1);

    std::fs::write(&path, format!("{first}\n{second}\n")).unwrap();
    let (next, reset, items) = read_file(&path, offset, false).unwrap();
    assert!(!reset);
    assert_eq!(items.len(), 1);
    assert!(matches!(&items[0], TranscriptItem::Prompt { text, .. } if text == "two"));

    // Rewritten shorter than our offset: start over from the top.
    std::fs::write(&path, format!("{first}\n")).unwrap();
    let (_, reset, items) = read_file(&path, next, false).unwrap();
    assert!(reset);
    assert_eq!(items.len(), 1);
    let _ = std::fs::remove_dir_all(&dir);
}
