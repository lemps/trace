//! Build the environment the `claude` CLI runs under. Trimmed to the essentials
//! needed by the PTY transport: capture the user's login-shell env, augment
//! PATH, and apply per-agent overrides.

use std::collections::HashMap;

use crate::platform::ports::AgentEnvironment;
use crate::platform::Os;

/// Env var prefixes that override the CLI's built-in model resolution. Stripping
/// them lets `--model opus` resolve to the latest model the CLI knows, instead
/// of stale values baked into a shell profile.
pub const MODEL_OVERRIDE_ENV_PREFIXES: &[&str] = &["CLAUDE_MODEL_", "CLAUDE_BEDROCK_MODEL_"];

/// Markers a running Claude Code session puts on its child processes. When trace
/// itself was started from a Claude session (a dev build, `open` from a
/// terminal agent), they'd reach every agent it spawns, and Claude would treat
/// each as a nested helper of that session: transcript saving off (so
/// `--resume` has nothing to resume) and a link back to the parent's messaging
/// socket. trace's agents are top-level sessions, so these never pass through.
/// Session *identity* only — `CLAUDE_CODE_*` settings a user exports (Bedrock,
/// output limits) are left alone.
pub const INHERITED_SESSION_ENV: &[&str] = &[
    "CLAUDECODE",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_PID",
    "CLAUDE_JOB_DIR",
];

/// Compose the effective CLI env: the user's env + an augmented PATH (so common
/// install locations resolve) + caller overrides.
pub fn build_effective_cli_env(env_overrides: &HashMap<String, String>) -> HashMap<String, String> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut env_map = Os::capture_env();
    for key in INHERITED_SESSION_ENV {
        env_map.remove(*key);
    }

    let existing = env_map
        .get("PATH")
        .cloned()
        .or_else(|| std::env::var("PATH").ok())
        .unwrap_or_default();
    // Prepend trace's bin dir so the generated `trace-render` producer resolves
    // (see `claude::render_bridge`), then the usual install locations.
    let mut dirs = vec![crate::helpers::trace_bin_dir()];
    dirs.extend(Os::extra_path_dirs(&home));
    dirs.extend(std::env::split_paths(&existing));
    // Only fails on a directory holding the separator, which couldn't be searched.
    if let Ok(merged) = std::env::join_paths(dirs) {
        env_map.insert("PATH".to_string(), merged.to_string_lossy().into_owned());
    }

    for (key, value) in env_overrides {
        if !key.trim().is_empty() {
            env_map.insert(key.clone(), value.clone());
        }
    }

    env_map
}
