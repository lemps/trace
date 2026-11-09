//! trace's helpers inside a sandbox, written on every start so a sandbox made
//! by an older trace gets the current ones: `trace-hook`, which appends Claude
//! Code's hook events to `~/.trace/events.log` (`events` reads it); a `gh`
//! shim that logs the PRs `gh pr create` opens; and `trace-keepalive`, which
//! keeps the sandbox running while its agent works and stops it once idle,
//! with trace closed too. All go in `~/.local/bin`, which is first on the
//! image's PATH, so nothing has to change the agent's.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::json;

use super::SelfService;

const TRACE_HOOK: &str = include_str!("helpers/trace-hook.sh");
const GH_SHIM: &str = include_str!("helpers/gh.sh");
const KEEPALIVE: &str = include_str!("helpers/trace-keepalive.sh");

/// How long a sandbox runs on unattended once its agent has nothing to do,
/// before it stops (and saves). Conductor's choice too.
pub const IDLE_STOP: Duration = Duration::from_secs(5 * 60);
/// The longest one run of a sandbox lasts, working or not.
pub const MAX_RUN: Duration = Duration::from_secs(6 * 60 * 60);

/// Where the helpers go, under `$HOME`.
pub const BIN: &str = ".local/bin";

/// Write the helpers. Their contents are arguments, never part of the script.
pub fn install_argv() -> Vec<String> {
    [
        "bash",
        "-c",
        r#"mkdir -p "$HOME/$1" && cd "$HOME/$1" && printf '%s' "$2" > trace-hook && printf '%s' "$3" > gh && printf '%s' "$4" > trace-keepalive && chmod +x trace-hook gh trace-keepalive"#,
        "trace-helpers",
        BIN,
        TRACE_HOOK,
        GH_SHIM,
        KEEPALIVE,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// Start the keep-alive, unless one is running already (it checks).
pub fn keepalive_argv() -> Vec<String> {
    vec![
        "bash".to_string(),
        "-c".to_string(),
        format!(r#"exec "$HOME/{BIN}/trace-keepalive""#),
    ]
}

/// What the keep-alive is told: where to ask for time and to stop, and when.
pub fn keepalive_env(service: &SelfService) -> HashMap<String, String> {
    HashMap::from([
        (
            "TRACE_KEEPALIVE_EXTEND".to_string(),
            service.extend_url.clone(),
        ),
        ("TRACE_KEEPALIVE_STOP".to_string(), service.stop_url.clone()),
        (
            "TRACE_IDLE_SECS".to_string(),
            IDLE_STOP.as_secs().to_string(),
        ),
        ("TRACE_MAX_SECS".to_string(), MAX_RUN.as_secs().to_string()),
    ])
}

/// `args` with the hooks in its `--settings`: merged into one already there
/// (a chat's permission rules), else added. One `--settings`, never two.
pub fn with_hook_settings(mut args: Vec<String>) -> Vec<String> {
    let hooks: serde_json::Value =
        serde_json::from_str(&hook_settings()).unwrap_or_else(|_| json!({}));
    let at = args.iter().position(|a| a == "--settings");
    let existing = at
        .and_then(|i| args.get(i + 1))
        .and_then(|v| serde_json::from_str::<serde_json::Value>(v).ok())
        .filter(serde_json::Value::is_object);
    match (at, existing) {
        (Some(i), Some(mut settings)) => {
            settings["hooks"] = hooks["hooks"].clone();
            args[i + 1] = settings.to_string();
        }
        _ => args.extend(["--settings".to_string(), hooks.to_string()]),
    }
    args
}

/// The hooks every agent in a sandbox gets: those local agents have
/// (`claude::hooks::settings_arg`), each calling the sandbox's `trace-hook`.
/// A terminal's turns reach trace through them; a chat says its turns in-band,
/// but its hooks still tell the keep-alive whether it's working.
pub fn hook_settings() -> String {
    let command = |event: &str| format!("\"$HOME/{BIN}/trace-hook\" {event}");
    let hook =
        |event: &str| json!([{ "hooks": [{ "type": "command", "command": command(event) }] }]);
    json!({ "hooks": {
        "Stop": hook("stop"),
        "Notification": hook("needs-input"),
        "UserPromptSubmit": hook("prompt"),
        "PermissionRequest": hook("permission"),
        "PostToolUse": [{
            "matcher": "AskUserQuestion|ExitPlanMode",
            "hooks": [{ "type": "command", "command": command("answered") }],
        }],
    } })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_helpers_go_in_as_arguments() {
        let argv = install_argv();
        assert!(
            !argv[2].contains("flock"),
            "scripts aren't spliced into the command"
        );
        assert!(argv[5].contains("events.log"));
        assert!(argv[6].contains("pr create"));
    }

    #[test]
    fn every_turn_hook_calls_the_sandbox_trace_hook() {
        let v: serde_json::Value = serde_json::from_str(&hook_settings()).expect("json");
        let stop = v["hooks"]["Stop"][0]["hooks"][0]["command"]
            .as_str()
            .expect("stop");
        assert_eq!(stop, "\"$HOME/.local/bin/trace-hook\" stop");
        assert!(v["hooks"]["Notification"].is_array());
    }
}
