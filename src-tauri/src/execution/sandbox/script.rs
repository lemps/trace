//! The commands trace runs inside a sandbox, as argument lists. Pure, so they're
//! tested here rather than against a live sandbox. Nothing secret goes in an
//! argument list: providers show and log command lines, so tokens travel only
//! in the environment ([`clone_env`], `ClaudeCredential::env`).

use std::collections::HashMap;

use super::TMUX_SESSION;
use crate::github::token::Token;
use crate::repo_catalog::model::RemoteRepo;

const GITHUB: &str = "https://github.com";

fn argv(parts: &[&str]) -> Vec<String> {
    parts.iter().map(|s| s.to_string()).collect()
}

/// Where the repo is cloned: `<home>/<name>`.
pub fn repo_dir(home: &str, remote: &RemoteRepo) -> String {
    format!("{home}/{}", remote.name)
}

pub fn clone_argv(remote: &RemoteRepo, dir: &str) -> Vec<String> {
    let url = format!("{GITHUB}/{}.git", remote.full_name());
    argv(&["git", "clone", "--", &url, dir])
}

/// The clone's environment: the token as an `extraHeader` (never in the URL),
/// no credential helper to store it, and no prompt nobody can answer.
pub fn clone_env(token: Option<&Token>) -> HashMap<String, String> {
    let mut env = HashMap::from([("GIT_TERMINAL_PROMPT".to_string(), "0".to_string())]);
    if let Some(token) = token {
        let pairs = [
            (
                format!("http.{GITHUB}/.extraHeader"),
                format!("Authorization: {}", token.basic_header()),
            ),
            ("credential.helper".to_string(), String::new()),
        ];
        for (i, (key, value)) in pairs.iter().enumerate() {
            env.insert(format!("GIT_CONFIG_KEY_{i}"), key.clone());
            env.insert(format!("GIT_CONFIG_VALUE_{i}"), value.clone());
        }
        env.insert("GIT_CONFIG_COUNT".to_string(), pairs.len().to_string());
    }
    env
}

/// The session's own branch, as a local session gets one. A sandbox is made
/// fresh each time a stopped session restarts, so if the branch was pushed (the
/// agent opened a PR from it) the new clone picks it up rather than starting a
/// second branch of the same name from the default one.
pub fn branch_argv(dir: &str, branch: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"if git -C "$1" rev-parse --verify --quiet "refs/remotes/origin/$2" >/dev/null; then
  git -C "$1" checkout -B "$2" --track "origin/$2"
else
  git -C "$1" checkout -b "$2"
fi"#,
        "trace-branch",
        dir,
        branch,
    ])
}

/// Write `content` to `$HOME/<rel>`. The content is an argument to the script,
/// never part of it, so nothing in it needs quoting.
pub fn write_home_file_argv(rel: &str, content: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"mkdir -p "$(dirname "$HOME/$2")" && printf '%s' "$1" > "$HOME/$2""#,
        "trace-write",
        content,
        rel,
    ])
}

/// A setup command line, run in the checkout through a login shell (so the
/// image's PATH, `nvm` and the like are there). Its output all goes to stderr,
/// where a failure's tail is read from: setup tools print errors either way.
pub fn setup_argv(dir: &str, line: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"cd "$1" && exec bash -lc "$2" 1>&2"#,
        "trace-setup",
        dir,
        line,
    ])
}

/// tmux as trace needs it: no status bar under the TUI, the last client to
/// resize sets the size (shared viewing), and the server goes when the agent does.
pub const TMUX_CONF: &str = "set -g status off\nset -g window-size latest\nset -g exit-empty on\n";

/// Claude Code's `~/.claude.json`: onboarding done and the repo trusted, so the
/// TUI opens on the prompt rather than on questions; and an API key accepted.
pub fn claude_json(dir: &str, approved_key_suffix: Option<&str>) -> String {
    let mut json = serde_json::json!({
        "hasCompletedOnboarding": true,
        "projects": { dir: { "hasTrustDialogAccepted": true } },
    });
    if let Some(suffix) = approved_key_suffix {
        json["customApiKeyResponses"] = serde_json::json!({ "approved": [suffix], "rejected": [] });
    }
    json.to_string()
}

/// Set git's identity from the GitHub account (`GH_TOKEN` in the env), with
/// GitHub's no-reply address. Best-effort: commits still work without it.
pub fn git_identity_argv() -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"login=$(gh api user --jq .login) || exit 0
id=$(gh api user --jq .id); name=$(gh api user --jq '.name // .login')
git config --global user.name "$name"
git config --global user.email "$id+$login@users.noreply.github.com"
gh auth setup-git"#,
    ])
}

/// `$HOME/<rel>`'s contents, or nothing when it isn't there.
pub fn read_home_file_argv(rel: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"cat "$HOME/$1" 2>/dev/null || true"#,
        "trace-read",
        rel,
    ])
}

/// Whether the sandbox has the Claude conversation `id`, to resume it by id.
pub fn conversation_argv(id: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"compgen -G "$HOME/.claude/projects/*/$1.jsonl" >/dev/null"#,
        "trace-conversation",
        id,
    ])
}

/// Whether Claude Code has a conversation saved in the sandbox to continue.
pub fn has_conversation_argv() -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"compgen -G "$HOME/.claude/projects/*/*.jsonl" >/dev/null"#,
    ])
}

/// The agent's own command line, as `claude::pty` builds it locally.
/// `continue_conversation` picks up the sandbox's last conversation, for a
/// session started again after a stop.
pub fn claude_argv(
    model: Option<&str>,
    extra_args: &[String],
    prompt: Option<&str>,
    continue_conversation: bool,
) -> Vec<String> {
    let mut out = vec!["claude".to_string()];
    if continue_conversation {
        out.push("--continue".to_string());
    }
    if let Some(model) = model {
        out.extend(["--model".to_string(), model.to_string()]);
    }
    out.extend(extra_args.iter().cloned());
    out.extend(prompt.map(str::to_string));
    out
}

/// Start the agent in a detached tmux session at `dir`.
pub fn tmux_start_argv(dir: &str, cols: u16, rows: u16, agent: &[String]) -> Vec<String> {
    let (cols, rows) = (cols.to_string(), rows.to_string());
    let mut out = argv(&[
        "tmux",
        "new-session",
        "-d",
        "-s",
        TMUX_SESSION,
        "-x",
        &cols,
        "-y",
        &rows,
        "-c",
        dir,
    ]);
    out.extend(agent.iter().cloned());
    out
}

/// End the terminal's tmux, and the Claude in it.
pub fn tmux_kill_argv() -> Vec<String> {
    argv(&["tmux", "kill-server"])
}

/// Whether the sandbox's one-time setup finished: its marker, or (a sandbox
/// set up before there was one) a clone and Claude's settings both in place.
pub fn setup_done_argv(dir: &str) -> Vec<String> {
    argv(&[
        "bash",
        "-c",
        r#"test -f "$HOME/.trace/setup-done" || { test -d "$1/.git" && test -f "$HOME/.claude.json"; }"#,
        "trace-setup-done",
        dir,
    ])
}

/// Where the setup marker goes, under `$HOME`.
pub const SETUP_MARKER: &str = ".trace/setup-done";

pub fn tmux_alive_argv() -> Vec<String> {
    argv(&["tmux", "has-session", "-t", TMUX_SESSION])
}

pub fn tmux_attach_argv() -> Vec<String> {
    argv(&["tmux", "attach", "-t", TMUX_SESSION])
}

/// A label value a provider will take: printable, single-line, at most 200
/// characters. Titles are the user's, so anything odd becomes a space.
pub fn label_value(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || " -_.:/@".contains(c) {
                c
            } else {
                ' '
            }
        })
        .collect();
    let squashed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    squashed.chars().take(200).collect()
}

#[cfg(test)]
#[path = "script_tests.rs"]
mod tests;
