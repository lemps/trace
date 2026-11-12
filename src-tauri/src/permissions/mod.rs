//! trace's own permission layer.
//!
//! Claude Code evaluates a tool call in six steps — hooks, deny rules, **ask rules**,
//! permission mode, allow rules, then the permission-prompt tool. Two of those
//! properties are what this module is built on: an ask rule sends a call to the
//! prompt tool *even in `bypassPermissions` mode*, and an ask rule outranks any
//! allow rule, including the user's own in `~/.claude/settings.json`.
//!
//! So an agent trace decides for runs with its own checks bypassed and
//! `permissions.ask: ["*"]` in its `--settings`: every call arrives at trace's
//! prompt tool (`agent_session::claude::prompts`), trace answers it from the rules
//! here, and only what the rules don't settle becomes a card. Reads are answered
//! here in Rust, so a turn that reads twenty files never troubles the renderer.
//!
//! An agent trace *can't* decide for — a terminal TUI, which owns its own dialog —
//! gets the same list [`project`]ed into Claude's own `allow`/`ask`/`deny` rules
//! instead. One list, two enforcers, and [`evaluate`] copies Claude's precedence
//! (deny beats ask beats allow) so the two can't disagree.

pub mod evaluate;
pub mod model;
pub mod rules;
pub mod store;
pub mod tools;

#[cfg(test)]
mod tests;

pub use model::{Action, Decision, Rule, RuleDraft};

use serde_json::Value;

/// The permission mode that hands the decision to trace. trace's own value, never a
/// `--permission-mode` Claude would take: [`AgentOptions::claude_flags`] sends
/// `bypassPermissions` for it, and the ask rule below is what brings the calls back.
///
/// [`AgentOptions::claude_flags`]: crate::agent_session::options::AgentOptions::claude_flags
pub const TRACE_MODE: &str = "traceReview";

/// The ask rule that routes every call to trace. A glob rather than a list of tool
/// names on purpose: a list silently misses a tool trace doesn't know (a new
/// built-in, an MCP server's), and those would run unreviewed.
const ASK_EVERYTHING: &str = "*";

/// What goes under `permissions` in an agent's `--settings`.
#[derive(Default, Debug, PartialEq, Eq)]
pub struct SettingsPerms {
    pub allow: Vec<String>,
    pub ask: Vec<String>,
    pub deny: Vec<String>,
}

impl SettingsPerms {
    pub fn is_empty(&self) -> bool {
        self.allow.is_empty() && self.ask.is_empty() && self.deny.is_empty()
    }
}

/// Whether `workspace_id` is set to let trace decide, and can.
pub fn trace_decides(workspace_id: &str, chat: bool) -> bool {
    // Only the chat transport routes its prompts to trace; a terminal agent's
    // dialog belongs to its TUI, whatever the workspace is set to.
    chat && crate::agent_session::options::store::stored(workspace_id)
        .permission_mode
        .as_deref()
        == Some(TRACE_MODE)
}

/// The `permissions` for an agent's `--settings`. `allow` carries trace's own tools
/// when its endpoint is up; the rest depends on who decides.
pub fn settings_perms(workspace_id: &str, chat: bool, trace_tools: bool) -> SettingsPerms {
    let mut perms = SettingsPerms::default();
    if trace_tools {
        perms.allow.push(crate::agent_tools::ALLOW_RULE.to_string());
    }
    if trace_decides(workspace_id, chat) {
        // Everything comes to trace; it answers from the rules, in Rust.
        perms.ask.push(ASK_EVERYTHING.to_string());
        return perms;
    }
    project(&mut perms, repo_of(workspace_id).as_deref());
    perms
}

/// trace's rules as Claude Code's own, for an agent trace can't answer for.
fn project(perms: &mut SettingsPerms, repo: Option<&str>) {
    let Ok(rules) = store::list() else {
        return;
    };
    for rule in rules {
        // A rule for another repo isn't this agent's.
        if rule.repo.as_deref().is_some_and(|r| Some(r) != repo) {
            continue;
        }
        // A bare-name deny would take the tool out of Claude's context entirely,
        // which is a bigger thing than the user asked for. Only scoped denies cross.
        let scoped = rules::split(&rule.tool).1.is_some();
        match rule.action {
            Action::Allow => perms.allow.push(rule.tool),
            Action::Ask => perms.ask.push(rule.tool),
            Action::Deny if scoped => perms.deny.push(rule.tool),
            Action::Deny => {}
        }
    }
}

/// Decide one call for `workspace_id`, from its run's grants and the saved rules.
pub fn decide(workspace_id: &str, tool: &str, input: &Value) -> Decision {
    let saved = store::list().unwrap_or_default();
    let session = store::session_rules(workspace_id);
    evaluate::decide(
        tool,
        input,
        repo_of(workspace_id).as_deref(),
        &session,
        &saved,
    )
}

/// The repo a workspace works in, for the rules scoped to one. None when it has no
/// repo (a folder or scratch session) or the lookup fails — then only the rules that
/// apply everywhere do.
fn repo_of(workspace_id: &str) -> Option<String> {
    crate::commands::repos::repo_for(workspace_id).ok()
}

/// Remember an "always allow" answer for the rest of this run. `tool_rule` is the
/// rule the button named (`prompts::Pending::rule_for`).
pub fn grant(workspace_id: &str, tool_rule: String) {
    store::grant(
        workspace_id,
        Rule {
            id: crate::helpers::new_id(),
            tool: tool_rule,
            action: Action::Allow,
            repo: None,
            note: Some("Allowed for this run.".to_string()),
            created_at: 0,
        },
    );
}

/// An agent stopped: its run's grants stop with it.
pub fn forget(workspace_id: &str) {
    store::forget(workspace_id);
}
