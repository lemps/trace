//! The `claude` command line of a chat agent: the stream-json flags, the model,
//! the workspace's effort and permission mode (`agent_session::options`), its
//! conversation, and Settings' flags minus those the workspace's options replace.

use std::collections::HashMap;
use std::process::{Child, Stdio};

use crate::agent_session::LaunchSpec;
use crate::claude::conversations::claude_session_ids;
use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::{build_effective_cli_env, MODEL_OVERRIDE_ENV_PREFIXES};
use crate::platform::ports::ToolLocator;
use crate::platform::Os;

/// The flags that make `claude` a structured, long-lived peer rather than a TUI.
const STREAM_FLAGS: [&str; 9] = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-prompt-tool",
    "stdio",
];

/// Lets the composer switch a running agent to Full access
/// (`set_permission_mode` `bypassPermissions`), which Claude refuses unless it
/// was started with this. It doesn't bypass anything by itself. Only for an
/// agent on this machine: a sandbox picks its own permissions.
const ALLOW_BYPASS: &str = "--allow-dangerously-skip-permissions";

/// The flags every chat `claude` gets before its conversation flag, wherever
/// it runs: the stream-json protocol, the model, and the workspace's effort and
/// permission mode.
pub(super) fn stream_args(spec: &LaunchSpec) -> Vec<String> {
    let mut args: Vec<String> = STREAM_FLAGS.iter().map(|f| f.to_string()).collect();
    if let Some(model) = &spec.model {
        args.extend(["--model".to_string(), model.clone()]);
    }
    args.extend(spec.options.claude_flags());
    args
}

/// Settings' flags and trace's wiring, after the conversation flag, minus the
/// flags the workspace's own options replace.
pub(super) fn extra_args(spec: &LaunchSpec) -> Vec<String> {
    spec.options.without_replaced_flags(&spec.extra_args)
}

/// The `claude` process, through `platform::process` like every spawn.
pub(super) fn spawn(spec: &LaunchSpec) -> Result<Child, String> {
    let overrides: HashMap<String, String> = spec.env.iter().cloned().collect();
    let env = build_effective_cli_env(&overrides);
    let cli =
        find_cli_with_env("claude", Some(&env)).ok_or("Could not find the `claude` CLI on PATH")?;
    let cwd = spec.cwd.to_string_lossy().into_owned();
    let (resume, fresh) = match &spec.resume {
        Some(id) => (Some(id.clone()), None),
        None => claude_session_ids(&spec.workspace_id, "claude", &cwd),
    };
    // An npm install is a `.cmd` shim on Windows: run it the way a PTY does.
    let argv = Os::pty_invocation(&cli);
    let (program, lead) = argv
        .split_first()
        .ok_or("No way to run the `claude` CLI.")?;
    let mut cmd = crate::platform::process::command(program);
    cmd.args(lead).args(stream_args(spec)).arg(ALLOW_BYPASS);
    match (resume, fresh) {
        (Some(id), _) => cmd.args(["--resume", &id]),
        (None, Some(id)) => cmd.args(["--session-id", &id]),
        (None, None) => &mut cmd,
    };
    cmd.args(extra_args(spec));
    // A clean env, minus prefixes that would defeat `--model` alias resolution.
    cmd.env_clear();
    cmd.envs(env.iter().filter(|(key, _)| {
        !MODEL_OVERRIDE_ENV_PREFIXES
            .iter()
            .any(|prefix| key.starts_with(prefix))
    }));
    cmd.current_dir(&spec.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn()
        .map_err(|e| format!("Couldn't start claude: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::options::AgentOptions;

    fn spec(extra: &[&str], options: AgentOptions) -> LaunchSpec {
        LaunchSpec {
            workspace_id: "w".into(),
            cwd: "/w".into(),
            model: Some("opus".into()),
            resume: None,
            extra_args: extra.iter().map(|s| s.to_string()).collect(),
            env: vec![],
            next_seq: 0,
            options,
            tools: None,
        }
    }

    #[test]
    fn the_workspace_options_go_on_the_command_line_and_win() {
        let options = AgentOptions {
            model: Some("opus".into()),
            effort: Some("max".into()),
            permission_mode: Some("plan".into()),
        };
        let s = spec(
            &["--dangerously-skip-permissions", "--add-dir", "/x"],
            options,
        );
        let args = stream_args(&s);
        assert_eq!(
            &args[STREAM_FLAGS.len()..],
            [
                "--model",
                "opus",
                "--effort",
                "max",
                "--permission-mode",
                "plan"
            ]
        );
        assert_eq!(extra_args(&s), ["--add-dir", "/x"]);
    }

    #[test]
    fn with_nothing_picked_settings_flags_stand() {
        let s = spec(&["--dangerously-skip-permissions"], AgentOptions::default());
        assert_eq!(&stream_args(&s)[STREAM_FLAGS.len()..], ["--model", "opus"]);
        assert_eq!(extra_args(&s), ["--dangerously-skip-permissions"]);
    }
}
