//! Deciding one call: the pure core of trace's permission layer.
//!
//! The precedence is Claude Code's own — **deny beats ask beats allow**, whatever
//! each rule's shape — so trace's answer for a chat agent and Claude's answer for a
//! terminal agent, from the same list, are the same answer. An allow rule never
//! carves an exception out of a deny or an ask.
//!
//! Anything no rule claims is asked about. That is the whole point of the mode: the
//! agent runs with its own permission checks bypassed, so what trace doesn't
//! recognise is what the user sees.

use serde_json::Value;

use super::model::{Action, Decision, Rule};
use super::rules;
use super::tools;

/// The sentence a denied agent is given when the rule's author didn't write one.
const DENIED: &str = "trace's permission rules don't allow this.";

/// Decide a call. `session` are the rules added by answering "always allow" during
/// this run; they rank with the saved ones.
pub fn decide(
    tool: &str,
    input: &Value,
    repo: Option<&str>,
    session: &[Rule],
    saved: &[Rule],
) -> Decision {
    // trace's own tools are trace's own policy, and never reach a card.
    if tools::is_trace_tool(tool) {
        return Decision::Allow;
    }
    let mut matched: Vec<&Rule> = session
        .iter()
        .chain(saved.iter())
        .filter(|rule| rules::matches(rule, tool, input, repo))
        .collect();
    // Deny first, so the reason the user gets is the denying rule's own.
    matched.sort_by_key(|rule| match rule.action {
        Action::Deny => 0,
        Action::Ask => 1,
        Action::Allow => 2,
    });
    match matched.first() {
        Some(rule) if rule.action == Action::Deny => Decision::Deny(reason(rule)),
        Some(rule) if rule.action == Action::Ask => Decision::Ask,
        Some(_) => Decision::Allow,
        // No rule claimed it: a read runs, anything else is worth a look.
        None if tools::is_read_only(tool) => Decision::Allow,
        None => Decision::Ask,
    }
}

fn reason(rule: &Rule) -> String {
    match rule
        .note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
    {
        Some(note) => format!("{DENIED} ({note})"),
        None => DENIED.to_string(),
    }
}
