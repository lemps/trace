//! A permission rule as it is stored and as the renderer sends it.

use serde::{Deserialize, Serialize};

/// What a rule does with a call it matches.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Run it without asking.
    Allow,
    /// Put an approval card in front of the user.
    Ask,
    /// Refuse it, and tell the agent why.
    Deny,
}

/// One rule. `tool` is written the way Claude Code writes its own permission rules —
/// `Tool`, `Tool(specifier)` or a tool-name glob (`mcp__*`, `*`) — so the same list
/// can be handed to Claude for the agents trace can't decide for itself
/// (`super::project`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub tool: String,
    pub action: Action,
    /// The repo this rule is for; `None` applies everywhere.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo: Option<String>,
    /// Why it's here, in the user's words. Shown in Settings, never sent to an agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub created_at: i64,
}

/// What the renderer sends to save: no `id` adds a rule, an `id` replaces one.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuleDraft {
    #[serde(default)]
    pub id: Option<String>,
    pub tool: String,
    pub action: Action,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

/// What trace decided about one call.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Ask,
    /// Denied, with the sentence the agent is given.
    Deny(String),
}
