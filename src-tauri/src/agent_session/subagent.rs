//! A subagent, as the journal carries it: the tool call that started one (Claude's
//! Task/Agent, Codex's `spawnAgent`) holds what's known about the agent it
//! started. Its own messages and calls are rows of their own with `parentCallId`
//! naming that call. Part of the journal contract (re-exported from `journal`,
//! mirrored by `Subagent` in `src/domains/agentChat/types.ts`).

use serde::{Deserialize, Serialize};

/// How a subagent is doing. Separate from its call's `ToolState`: a background
/// subagent's call returns at once while the agent works on.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SubagentState {
    Running,
    Completed,
    Failed,
    /// Interrupted, stopped on its own, or its agent went away.
    Stopped,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Subagent {
    /// Its kind ("Explore", "general-purpose"), when the agent names one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
    /// A few words on its job ("Find the auth code").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// It outlives the turn that started it.
    #[serde(default)]
    pub background: bool,
    pub state: SubagentState,
    /// What it's doing now, in the agent's words ("Finding **/*").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activity: Option<String>,
    /// Tool calls so far, as the agent counts them.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_uses: Option<u32>,
    /// How long it ran (or has run so far).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    /// Its final report, capped.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
}

impl Subagent {
    pub fn running(
        agent_type: Option<String>,
        description: Option<String>,
        background: bool,
    ) -> Self {
        Self {
            agent_type,
            description,
            background,
            state: SubagentState::Running,
            activity: None,
            tool_uses: None,
            duration_ms: None,
            result: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.state == SubagentState::Running
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serialises_camel_case_and_skips_what_is_unknown() {
        let s = Subagent::running(Some("Explore".into()), None, true);
        assert_eq!(
            serde_json::to_value(&s).unwrap(),
            json!({"agentType": "Explore", "background": true, "state": "running"})
        );
        let back: Subagent = serde_json::from_value(json!({"state": "stopped"})).unwrap();
        assert_eq!(back.state, SubagentState::Stopped);
        assert!(!back.background);
    }
}
