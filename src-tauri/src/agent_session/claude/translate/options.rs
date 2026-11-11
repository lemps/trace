//! Changing a running Claude's options over stream-json, as the Agent SDK's
//! `setModel()`, `setPermissionMode()` and `applyFlagSettings()` do. Verified
//! against Claude Code 2.1.319:
//!
//! - `set_model` `{model}` answers with the resolved id (`{"model":
//!   "claude-haiku-5-5"}`); the next turn's `init` names it too.
//! - `set_permission_mode` `{mode}` answers `{"mode"}` and Claude also sends a
//!   `system` `status` with `permissionMode`. `bypassPermissions` is refused
//!   unless Claude started with `--allow-dangerously-skip-permissions`.
//! - `apply_flag_settings` `{settings: {effortLevel}}` answers with no body;
//!   headless Claude doesn't report effort back, so the request stands for it.
//!
//! `SessionInfo` changes only when Claude says yes. A refusal is a warning row
//! (`Translator::line`'s `control_response` handling).

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{Out, Translator};
use crate::agent_session::claude::prompts::str_at;
use crate::agent_session::journal::Tone;
use crate::agent_session::options::AgentOptions;

/// One option sent, waiting on Claude's answer.
#[derive(Clone, Debug, PartialEq)]
enum Change {
    Model(String),
    Effort(String),
    Mode(String),
}

/// Option requests of ours still waiting on a `control_response`.
#[derive(Default)]
pub(super) struct OptionRequests {
    sent: u64,
    pending: HashMap<String, Change>,
}

/// The control request for one change.
fn request(id: &str, change: &Change) -> Value {
    let body = match change {
        Change::Model(model) => json!({"subtype": "set_model", "model": model}),
        Change::Mode(mode) => json!({"subtype": "set_permission_mode", "mode": mode}),
        Change::Effort(effort) => {
            json!({"subtype": "apply_flag_settings", "settings": {"effortLevel": effort}})
        }
    };
    json!({"type": "control_request", "request_id": id, "request": body})
}

fn changes(options: &AgentOptions) -> Vec<Change> {
    let mut list = Vec::new();
    list.extend(options.model.clone().map(Change::Model));
    list.extend(options.effort.clone().map(Change::Effort));
    // Trace's own mode can't be switched into live (`options::pick`): it needs the
    // launch's ask rule, so sending bypassPermissions now would lift the checks and
    // route nothing back.
    list.extend(
        options
            .permission_mode
            .clone()
            .filter(|mode| mode.as_str() != crate::permissions::TRACE_MODE)
            .map(Change::Mode),
    );
    list
}

impl Translator {
    /// What the agent was started with, before Claude says: its `init` names
    /// the model and mode, but headless Claude never names the effort.
    pub fn seed_options(&mut self, options: &AgentOptions) {
        self.info.effort = options.effort.clone();
        self.info.permission_mode = options.permission_mode.clone();
    }

    /// The control requests for changed options.
    pub fn set_options(&mut self, options: &AgentOptions) -> Vec<Out> {
        let mut out = Vec::new();
        for change in changes(options) {
            self.options.sent += 1;
            let id = format!("options-{}", self.options.sent);
            out.push(Out::Reply(request(&id, &change)));
            self.options.pending.insert(id, change);
        }
        out
    }

    /// A `control_response`: an option request's answer updates the info; any
    /// refusal is a warning row.
    pub(super) fn control_response(&mut self, m: &Value, out: &mut Vec<Out>) {
        let r = &m["response"];
        let change = str_at(r, "request_id").and_then(|id| self.options.pending.remove(id));
        if str_at(r, "subtype") == Some("error") {
            let text = str_at(r, "error").unwrap_or("Claude refused a request.");
            self.status(text, Tone::Warning, out);
            return;
        }
        let Some(change) = change else {
            return;
        };
        let said = &r["response"];
        match change {
            Change::Model(asked) => {
                let model = str_at(said, "model").map_or(asked, str::to_string);
                self.set_info(out, |i| i.model = Some(model));
            }
            Change::Mode(asked) => {
                let mode = str_at(said, "mode").map_or(asked, str::to_string);
                self.set_info(out, |i| i.permission_mode = Some(mode));
            }
            Change::Effort(effort) => self.set_info(out, |i| i.effort = Some(effort)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::SessionInfo;

    fn tr() -> Translator {
        Translator::new(0, || 0)
    }

    fn info(out: &[Out]) -> Option<&SessionInfo> {
        out.iter().find_map(|o| match o {
            Out::Info(i) => Some(i),
            _ => None,
        })
    }

    #[test]
    fn each_change_is_its_own_control_request() {
        let mut t = tr();
        let out = t.set_options(&AgentOptions {
            model: Some("sonnet".into()),
            effort: Some("max".into()),
            permission_mode: Some("plan".into()),
        });
        let sent: Vec<&Value> = out
            .iter()
            .map(|o| match o {
                Out::Reply(v) => v,
                other => panic!("not a reply: {other:?}"),
            })
            .collect();
        assert_eq!(
            sent,
            [
                &json!({"type": "control_request", "request_id": "options-1",
                    "request": {"subtype": "set_model", "model": "sonnet"}}),
                &json!({"type": "control_request", "request_id": "options-2",
                    "request": {"subtype": "apply_flag_settings",
                        "settings": {"effortLevel": "max"}}}),
                &json!({"type": "control_request", "request_id": "options-3",
                    "request": {"subtype": "set_permission_mode", "mode": "plan"}}),
            ]
        );
        assert!(t.set_options(&AgentOptions::default()).is_empty());
    }

    #[test]
    fn the_info_changes_when_claude_says_yes() {
        let mut t = tr();
        t.set_options(&AgentOptions {
            model: Some("haiku".into()),
            effort: Some("low".into()),
            ..AgentOptions::default()
        });
        // Recorded from Claude Code 2.1.319.
        let out = t.line(r#"{"type":"control_response","response":{"subtype":"success","request_id":"options-1","response":{"model":"claude-haiku-5-5"}}}"#);
        assert_eq!(
            info(&out).unwrap().model.as_deref(),
            Some("claude-haiku-5-5")
        );
        let out = t.line(r#"{"type":"control_response","response":{"subtype":"success","request_id":"options-2"}}"#);
        assert_eq!(info(&out).unwrap().effort.as_deref(), Some("low"));
    }

    #[test]
    fn a_refusal_is_a_warning_and_leaves_the_info() {
        let mut t = tr();
        t.seed_options(&AgentOptions {
            permission_mode: Some("default".into()),
            ..AgentOptions::default()
        });
        t.set_options(&AgentOptions {
            permission_mode: Some("bypassPermissions".into()),
            ..AgentOptions::default()
        });
        // Recorded from Claude Code 2.1.319, started without the allow flag.
        let out = t.line(r#"{"type":"control_response","response":{"subtype":"error","request_id":"options-1","error":"Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions","error_code":"bypass_not_launched"}}"#);
        assert!(info(&out).is_none());
        assert!(matches!(&out[0], Out::Row(_)));
        assert_eq!(t.info.permission_mode.as_deref(), Some("default"));
    }

    #[test]
    fn claude_names_a_mode_change_itself() {
        let mut t = tr();
        let out = t.line(r#"{"type":"system","subtype":"status","status":null,"permissionMode":"plan","uuid":"u","session_id":"s"}"#);
        assert_eq!(info(&out).unwrap().permission_mode.as_deref(), Some("plan"));
        let out = t.line(r#"{"type":"system","subtype":"init","model":"claude-haiku-5-5","permissionMode":"acceptEdits","slash_commands":[],"session_id":"s"}"#);
        let i = info(&out).unwrap();
        assert_eq!(i.permission_mode.as_deref(), Some("acceptEdits"));
        assert_eq!(i.model.as_deref(), Some("claude-haiku-5-5"));
    }
}
