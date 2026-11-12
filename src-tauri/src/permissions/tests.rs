use serde_json::json;

use super::evaluate::decide;
use super::model::{Action, Decision, Rule};
use super::rules::{glob, split};
use super::tools;

fn rule(tool: &str, action: Action) -> Rule {
    Rule {
        id: tool.to_string(),
        tool: tool.to_string(),
        action,
        repo: None,
        note: None,
        created_at: 0,
    }
}

fn bash(command: &str) -> serde_json::Value {
    json!({ "command": command })
}

#[test]
fn a_glob_is_anchored_at_both_ends() {
    assert!(glob("Bash", "Bash"));
    assert!(!glob("Bash", "BashOutput"));
    assert!(glob("*", "anything"));
    assert!(glob("mcp__*", "mcp__trace__get_board"));
    assert!(!glob("mcp__*", "Bash"));
    assert!(glob("git status*", "git status --short"));
    assert!(!glob("git status*", "cd x && git status"));
    assert!(glob("*test*", "npm run test -- --watch"));
}

#[test]
fn a_rule_splits_into_its_tool_and_specifier() {
    assert_eq!(split("Bash"), ("Bash", None));
    assert_eq!(split("Bash(git status*)"), ("Bash", Some("git status*")));
    // Parentheses inside the specifier are literal, so this stays one specifier.
    assert_eq!(split("Bash(echo (hi))"), ("Bash", Some("echo (hi)")));
    assert_eq!(split("Bash(unclosed"), ("Bash(unclosed", None));
}

#[test]
fn trace_s_own_tools_never_reach_a_card() {
    let deny_all = [rule("*", Action::Deny)];
    assert_eq!(
        decide("mcp__trace__get_board", &json!({}), None, &[], &deny_all),
        Decision::Allow
    );
}

#[test]
fn reads_run_and_everything_else_is_asked_about() {
    assert_eq!(
        decide("Read", &json!({"file_path": "/x"}), None, &[], &[]),
        Decision::Allow
    );
    assert_eq!(decide("Grep", &json!({}), None, &[], &[]), Decision::Allow);
    assert_eq!(
        decide("Bash", &bash("rm -rf build"), None, &[], &[]),
        Decision::Ask
    );
    // A tool nobody has heard of is asked about, never assumed safe.
    assert_eq!(
        decide("BrandNewTool", &json!({}), None, &[], &[]),
        Decision::Ask
    );
}

#[test]
fn deny_beats_ask_beats_allow_as_claude_orders_them() {
    let rules = [
        rule("Bash(git push*)", Action::Allow),
        rule("Bash", Action::Ask),
    ];
    // The allow is more specific, but an ask still prompts: Claude's own precedence.
    assert_eq!(
        decide("Bash", &bash("git push origin main"), None, &[], &rules),
        Decision::Ask
    );
    let rules = [
        rule("Bash(git push*)", Action::Allow),
        rule("Bash(git push --force*)", Action::Deny),
    ];
    assert!(matches!(
        decide("Bash", &bash("git push --force"), None, &[], &rules),
        Decision::Deny(_)
    ));
}

#[test]
fn a_denial_carries_its_rule_s_note() {
    let mut denied = rule("Bash(rm *)", Action::Deny);
    denied.note = Some("We don't delete from an agent".to_string());
    let Decision::Deny(why) = decide("Bash", &bash("rm -rf x"), None, &[], &[denied]) else {
        panic!("expected a denial");
    };
    assert!(why.contains("We don't delete from an agent"), "{why}");
}

#[test]
fn a_shell_rule_reaches_inside_a_compound_command() {
    let rules = [rule("Bash(rm *)", Action::Deny)];
    for command in [
        "rm -rf build",
        "cd /tmp && rm -rf build",
        "FOO=bar rm -rf build",
        "sudo rm -rf build",
        "ls; rm -rf build",
    ] {
        assert!(
            matches!(
                decide("Bash", &bash(command), None, &[], &rules),
                Decision::Deny(_)
            ),
            "{command}"
        );
    }
    // A different program with the same tail isn't that rule's business.
    assert_eq!(
        decide("Bash", &bash("echo rm -rf build"), None, &[], &rules),
        Decision::Ask
    );
}

#[test]
fn a_rule_for_another_repo_doesnt_apply() {
    let mut scoped = rule("Bash", Action::Allow);
    scoped.repo = Some("/code/trace".to_string());
    assert_eq!(
        decide(
            "Bash",
            &bash("ls"),
            Some("/code/trace"),
            &[],
            &[scoped.clone()]
        ),
        Decision::Allow
    );
    assert_eq!(
        decide(
            "Bash",
            &bash("ls"),
            Some("/code/other"),
            &[],
            &[scoped.clone()]
        ),
        Decision::Ask
    );
    assert_eq!(
        decide("Bash", &bash("ls"), None, &[], &[scoped]),
        Decision::Ask
    );
}

#[test]
fn this_run_s_grants_rank_with_the_saved_rules() {
    let granted = [rule("Bash(npm test*)", Action::Allow)];
    assert_eq!(
        decide("Bash", &bash("npm test -- --watch"), None, &granted, &[]),
        Decision::Allow
    );
    // A saved deny still wins over a grant, as a deny wins over any allow.
    let saved = [rule("Bash(npm*)", Action::Deny)];
    assert!(matches!(
        decide("Bash", &bash("npm test"), None, &granted, &saved),
        Decision::Deny(_)
    ));
}

#[test]
fn a_specifier_matches_the_field_its_tool_names() {
    assert_eq!(tools::subject("Bash", &bash("ls")).as_deref(), Some("ls"));
    assert_eq!(
        tools::subject("Edit", &json!({"file_path": "/a/b.rs"})).as_deref(),
        Some("/a/b.rs")
    );
    assert_eq!(
        tools::subject("WebFetch", &json!({"url": "https://x.dev"})).as_deref(),
        Some("https://x.dev")
    );
    assert_eq!(tools::subject("Unknown", &json!({"x": 1})), None);
    // With nothing to match, a specifier can't claim the call — but a bare name can.
    let specific = [rule("Unknown(x)", Action::Allow)];
    assert_eq!(
        decide("Unknown", &json!({}), None, &[], &specific),
        Decision::Ask
    );
    let bare = [rule("Unknown", Action::Allow)];
    assert_eq!(
        decide("Unknown", &json!({}), None, &[], &bare),
        Decision::Allow
    );
}
