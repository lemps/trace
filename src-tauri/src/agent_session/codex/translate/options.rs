//! A workspace's options for Codex: app-server takes no mid-turn setting, but
//! `turn/start` overrides the model, `effort`, `approvalPolicy` and
//! `sandboxPolicy` "for this turn and subsequent turns" (`TurnStartParams`,
//! codex-cli 0.137–0.147). So a change goes with the next message, and is sent
//! with every turn after it. Claude's names map onto Codex's:
//!
//! | Mode | approvalPolicy | sandboxPolicy |
//! | --- | --- | --- |
//! | `default` (Ask) | `untrusted` | `workspaceWrite` |
//! | `acceptEdits` | `on-request` | `workspaceWrite` |
//! | `bypassPermissions` (Full access) | `never` | `dangerFullAccess` |
//!
//! Codex has no plan mode here (its `collaborationMode` is experimental), and
//! its highest effort is `xhigh`, which a picked `max` becomes.

use serde_json::{json, Value};

use super::{str_at, Out, Translator};
use crate::agent_session::journal::Tone;
use crate::agent_session::options::AgentOptions;

/// What every `turn/start` overrides, once picked.
#[derive(Clone, Debug, Default, PartialEq)]
pub(in crate::agent_session::codex) struct TurnOverrides {
    model: Option<String>,
    /// Codex's name for it.
    effort: Option<String>,
    /// Claude's name for it; `mode_params` gives Codex's.
    mode: Option<String>,
}

impl TurnOverrides {
    /// Add the overrides to a `turn/start`'s params.
    pub(super) fn merge_into(&self, params: &mut Value) {
        if let Some(model) = &self.model {
            params["model"] = json!(model);
        }
        if let Some(effort) = &self.effort {
            params["effort"] = json!(effort);
        }
        if let Some((approval, sandbox)) = self.mode.as_deref().and_then(mode_params) {
            params["approvalPolicy"] = json!(approval);
            params["sandboxPolicy"] = sandbox;
        }
    }
}

/// Codex's effort for one of Claude's names.
fn codex_effort(effort: &str) -> &str {
    match effort {
        "max" => "xhigh",
        other => other,
    }
}

/// The approval policy and sandbox for a mode; None for one Codex lacks.
fn mode_params(mode: &str) -> Option<(&'static str, Value)> {
    let workspace = json!({
        "type": "workspaceWrite",
        "writableRoots": [],
        "networkAccess": false,
        "excludeTmpdirEnvVar": false,
        "excludeSlashTmp": false,
    });
    match mode {
        "default" => Some(("untrusted", workspace)),
        "acceptEdits" => Some(("on-request", workspace)),
        "bypassPermissions" => Some(("never", json!({"type": "dangerFullAccess"}))),
        _ => None,
    }
}

/// The mode a thread's approval policy and sandbox amount to, if one of ours.
fn mode_of(approval: &Value, sandbox: &Value) -> Option<&'static str> {
    let sandbox = str_at(sandbox, "type");
    match (approval.as_str(), sandbox) {
        (Some("never"), Some("dangerFullAccess")) => Some("bypassPermissions"),
        (Some("on-request"), Some("workspaceWrite")) => Some("acceptEdits"),
        (Some("untrusted"), Some("workspaceWrite" | "readOnly")) => Some("default"),
        _ => None,
    }
}

impl Translator {
    /// Changed options: kept for every `turn/start` from the next on.
    pub fn set_options(&mut self, options: &AgentOptions) -> Vec<Out> {
        let mut out = Vec::new();
        if let Some(model) = &options.model {
            self.overrides.model = Some(model.clone());
        }
        if let Some(effort) = &options.effort {
            self.overrides.effort = Some(codex_effort(effort).to_string());
        }
        match options.permission_mode.as_deref() {
            Some(mode) if mode_params(mode).is_some() => {
                self.overrides.mode = Some(mode.to_string());
            }
            Some(_) => {
                let text = "Codex has no plan mode here; its permissions stay as they were.";
                self.status(text, Tone::Warning, &mut out);
            }
            None => {}
        }
        let o = self.overrides.clone();
        self.set_info(&mut out, |i| {
            i.model = o.model.or(i.model.take());
            i.effort = o.effort.or(i.effort.take());
            i.permission_mode = o.mode.or(i.permission_mode.take());
        });
        out
    }

    /// What `thread/start` (or resume) says the thread runs with, where no
    /// override of ours replaces it.
    pub(super) fn thread_settings(&mut self, result: &Value, out: &mut Vec<Out>) {
        let effort = str_at(result, "reasoningEffort").map(str::to_string);
        let mode = mode_of(&result["approvalPolicy"], &result["sandbox"]).map(str::to_string);
        let o = self.overrides.clone();
        self.set_info(out, |i| {
            i.effort = o.effort.or(effort);
            i.permission_mode = o.mode.or(mode);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::codex::args::ThreadSettings;

    fn tr() -> Translator {
        Translator::new(0, || 0, ThreadSettings::default(), None)
    }

    fn opts(model: Option<&str>, effort: Option<&str>, mode: Option<&str>) -> AgentOptions {
        AgentOptions {
            model: model.map(str::to_string),
            effort: effort.map(str::to_string),
            permission_mode: mode.map(str::to_string),
        }
    }

    #[test]
    fn picked_options_override_every_turn_start() {
        let mut t = tr();
        t.set_options(&opts(
            Some("gpt-5.6"),
            Some("max"),
            Some("bypassPermissions"),
        ));
        let mut params = json!({"threadId": "t", "input": []});
        t.overrides.merge_into(&mut params);
        assert_eq!(
            params,
            json!({"threadId": "t", "input": [], "model": "gpt-5.6", "effort": "xhigh",
                "approvalPolicy": "never", "sandboxPolicy": {"type": "dangerFullAccess"}})
        );
        assert_eq!(t.info.effort.as_deref(), Some("xhigh"));
        assert_eq!(t.info.permission_mode.as_deref(), Some("bypassPermissions"));
    }

    #[test]
    fn nothing_picked_leaves_the_turn_alone() {
        let mut params = json!({"threadId": "t"});
        TurnOverrides::default().merge_into(&mut params);
        assert_eq!(params, json!({"threadId": "t"}));
    }

    #[test]
    fn plan_mode_is_refused_and_the_mode_kept() {
        let mut t = tr();
        t.set_options(&opts(None, None, Some("acceptEdits")));
        let out = t.set_options(&opts(None, None, Some("plan")));
        assert!(matches!(&out[0], Out::Row(_)));
        assert_eq!(t.overrides.mode.as_deref(), Some("acceptEdits"));
    }

    #[test]
    fn a_thread_settings_name_their_mode() {
        let ws = json!({"type": "workspaceWrite"});
        assert_eq!(mode_of(&json!("on-request"), &ws), Some("acceptEdits"));
        assert_eq!(mode_of(&json!("untrusted"), &ws), Some("default"));
        let full = json!({"type": "dangerFullAccess"});
        assert_eq!(mode_of(&json!("never"), &full), Some("bypassPermissions"));
        assert_eq!(mode_of(&json!("on-failure"), &ws), None);
        let mut t = tr();
        let mut out = Vec::new();
        let result = json!({"reasoningEffort": "medium", "approvalPolicy": "untrusted",
            "sandbox": {"type": "readOnly", "networkAccess": false}});
        t.thread_settings(&result, &mut out);
        assert_eq!(t.info.effort.as_deref(), Some("medium"));
        assert_eq!(t.info.permission_mode.as_deref(), Some("default"));
    }
}
