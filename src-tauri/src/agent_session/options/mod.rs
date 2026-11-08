//! A workspace's agent options, picked in the chat composer: the model, the
//! reasoning effort and the permission mode. Kept per workspace (`store`) so a
//! restart, a resume and a resume-after-quit start the agent with them, and
//! sent to a running agent where its CLI can switch mid-session:
//!
//! - Claude (stream-json): `set_model`, `set_permission_mode` and
//!   `apply_flag_settings` `{effortLevel}` control requests, all live
//!   (`claude::translate::options`). At launch: `--model`, `--effort`,
//!   `--permission-mode`.
//! - Codex (app-server): `turn/start` overrides for model, effort and approval
//!   policy + sandbox, from the next message on (`codex::translate::options`).
//!   No plan mode.
//!
//! The values are Claude Code's own names; the Codex adapter maps them.

pub mod store;

use serde::{Deserialize, Serialize};

use crate::state::AppState;

/// Reasoning effort levels, as Claude Code's `--effort` takes them.
pub const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

/// Permission modes the composer offers, as Claude Code's `--permission-mode`
/// takes them: Ask, Accept edits, Plan, Full access.
pub const MODES: [&str; 4] = ["default", "acceptEdits", "plan", "bypassPermissions"];

/// The longest model id taken: real ids are well under it.
const MODEL_MAX: usize = 100;

/// What a workspace's agent runs with, beyond Settings' defaults. `None` leaves
/// it to Settings (or the CLI's own default).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<String>,
}

impl AgentOptions {
    pub fn is_empty(&self) -> bool {
        self.model.is_none() && self.effort.is_none() && self.permission_mode.is_none()
    }

    /// Refuse values a CLI wouldn't take, before they reach its arguments: a
    /// model id is plain characters and never starts like a flag.
    pub fn validate(&self) -> Result<(), String> {
        if let Some(model) = &self.model {
            let plain = model
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-._:/[]".contains(c));
            if model.is_empty() || model.len() > MODEL_MAX || model.starts_with('-') || !plain {
                return Err(format!("“{model}” isn't a model id."));
            }
        }
        if let Some(effort) = &self.effort {
            if !EFFORTS.contains(&effort.as_str()) {
                return Err(format!("Unknown effort level “{effort}”."));
            }
        }
        if let Some(mode) = &self.permission_mode {
            if !MODES.contains(&mode.as_str()) {
                return Err(format!("Unknown permission mode “{mode}”."));
            }
        }
        Ok(())
    }

    /// One option picked: `kind` is the renderer's field name.
    pub fn one(kind: &str, value: String) -> Result<Self, String> {
        let mut o = Self::default();
        match kind {
            "model" => o.model = Some(value),
            "effort" => o.effort = Some(value),
            "permissionMode" => o.permission_mode = Some(value),
            other => return Err(format!("Unknown agent option “{other}”.")),
        }
        o.validate()?;
        Ok(o)
    }

    /// These options with `change`'s set fields on top.
    pub fn merged(&self, change: &Self) -> Self {
        Self {
            model: change.model.clone().or(self.model.clone()),
            effort: change.effort.clone().or(self.effort.clone()),
            permission_mode: change
                .permission_mode
                .clone()
                .or(self.permission_mode.clone()),
        }
    }

    /// Claude's launch flags for the effort and mode (the model goes as `--model`
    /// with the rest of the launch).
    pub fn claude_flags(&self) -> Vec<String> {
        let mut flags = Vec::new();
        if let Some(effort) = &self.effort {
            flags.extend(["--effort".to_string(), effort.clone()]);
        }
        if let Some(mode) = &self.permission_mode {
            flags.extend(["--permission-mode".to_string(), mode.clone()]);
        }
        flags
    }

    /// Settings → Agents flags minus those these options replace, so the
    /// workspace's own choice wins (a default `--dangerously-skip-permissions`
    /// would otherwise beat a picked Ask).
    pub fn without_replaced_flags(&self, args: &[String]) -> Vec<String> {
        // (flag, takes a value)
        let mut replaced: Vec<(&str, bool)> = Vec::new();
        if self.model.is_some() {
            replaced.push(("--model", true));
        }
        if self.effort.is_some() {
            replaced.push(("--effort", true));
        }
        if self.permission_mode.is_some() {
            replaced.push(("--permission-mode", true));
            replaced.push(("--dangerously-skip-permissions", false));
        }
        let mut kept = Vec::with_capacity(args.len());
        let mut it = args.iter();
        while let Some(arg) = it.next() {
            let (flag, inline) = match arg.split_once('=') {
                Some((f, _)) if f.starts_with("--") => (f, true),
                _ => (arg.as_str(), false),
            };
            match replaced.iter().find(|(f, _)| *f == flag) {
                Some((_, true)) if !inline => {
                    it.next();
                }
                Some(_) => {}
                None => kept.push(arg.clone()),
            }
        }
        kept
    }
}

/// Pick one of a workspace's options: saved for every start and, while its
/// chat agent runs, sent to it (even when it's what was saved: Claude may have
/// left plan mode by itself since). Returns the saved options, and true when
/// the agent took the pick without a restart. A model a provider pins is only
/// saved.
pub fn pick(
    state: &AppState,
    workspace_id: &str,
    kind: &str,
    value: String,
) -> Result<(AgentOptions, bool), String> {
    let change = AgentOptions::one(kind, value)?;
    let next = store::stored(workspace_id).merged(&change);
    store::save(workspace_id, &next)?;
    let agents = &state.chat_agents;
    let pinned = agents
        .info(workspace_id)
        .is_some_and(|i| i.provider.is_some());
    if !agents.is_running(workspace_id) || (pinned && change.model.is_some()) {
        return Ok((next, false));
    }
    let live = agents
        .with(workspace_id, |a| a.set_options(&change))
        .unwrap_or(false);
    Ok((next, live))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(model: Option<&str>, effort: Option<&str>, mode: Option<&str>) -> AgentOptions {
        AgentOptions {
            model: model.map(str::to_string),
            effort: effort.map(str::to_string),
            permission_mode: mode.map(str::to_string),
        }
    }

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn known_values_pass_and_others_are_refused() {
        assert!(opts(Some("claude-opus-5-5[1m]"), Some("max"), Some("plan"))
            .validate()
            .is_ok());
        assert!(opts(Some("opus"), Some("xhigh"), Some("bypassPermissions"))
            .validate()
            .is_ok());
        assert!(AgentOptions::default().validate().is_ok());
        assert!(opts(Some("--dangerously-skip-permissions"), None, None)
            .validate()
            .is_err());
        assert!(opts(Some("opus; rm -rf"), None, None).validate().is_err());
        assert!(opts(Some(""), None, None).validate().is_err());
        assert!(opts(None, Some("ultra"), None).validate().is_err());
        assert!(opts(None, None, Some("yolo")).validate().is_err());
    }

    #[test]
    fn a_pick_is_one_checked_option_laid_over_the_saved_ones() {
        let pick = AgentOptions::one("permissionMode", "plan".into()).unwrap();
        assert_eq!(pick, opts(None, None, Some("plan")));
        let saved = opts(Some("opus"), Some("high"), Some("default"));
        assert_eq!(
            saved.merged(&pick),
            opts(Some("opus"), Some("high"), Some("plan"))
        );
        assert!(AgentOptions::one("effort", "ultra".into()).is_err());
        assert!(AgentOptions::one("colour", "red".into()).is_err());
    }

    #[test]
    fn claude_gets_effort_and_mode_flags() {
        assert_eq!(
            opts(Some("opus"), Some("max"), Some("acceptEdits")).claude_flags(),
            args(&["--effort", "max", "--permission-mode", "acceptEdits"])
        );
        assert!(AgentOptions::default().claude_flags().is_empty());
    }

    #[test]
    fn a_picked_option_replaces_the_settings_flag_for_it() {
        let settings = args(&[
            "--dangerously-skip-permissions",
            "--model",
            "sonnet",
            "--effort=low",
            "--permission-mode",
            "plan",
            "--verbose",
            "--settings",
            "{\"x\":1}",
        ]);
        let mode_only = opts(None, None, Some("default"));
        assert_eq!(
            mode_only.without_replaced_flags(&settings),
            args(&[
                "--model",
                "sonnet",
                "--effort=low",
                "--verbose",
                "--settings",
                "{\"x\":1}"
            ])
        );
        let all = opts(Some("opus"), Some("high"), Some("default"));
        assert_eq!(
            all.without_replaced_flags(&settings),
            args(&["--verbose", "--settings", "{\"x\":1}"])
        );
        assert_eq!(
            AgentOptions::default().without_replaced_flags(&settings),
            settings
        );
    }

    #[test]
    fn options_read_as_the_renderer_writes_them() {
        let o: AgentOptions =
            serde_json::from_str(r#"{"model":"opus","permissionMode":"plan"}"#).unwrap();
        assert_eq!(o, opts(Some("opus"), None, Some("plan")));
        assert_eq!(
            serde_json::to_string(&opts(None, Some("low"), None)).unwrap(),
            r#"{"effort":"low"}"#
        );
    }
}
