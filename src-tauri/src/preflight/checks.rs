//! Turning what was found into checks: pure, so every outcome is tested without
//! `git`, `claude` or `gh` installed. `super` gathers the facts.

use serde::Serialize;

use crate::github::gh::parse_auth_status;
use crate::platform::install_hints::{can_install, install_hint, Tool};

/// What trace can do about a failed check itself, as a button on its row.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    /// Install the missing CLI (`super::install`).
    Install,
    /// Sign the CLI in through the browser (`super::sign_in`).
    SignIn,
}

/// One line of the preflight list, as the first run and the launch notice show it.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// Stable id the renderer keys on: "git", "claude", "gh", "codex".
    pub id: &'static str,
    pub ok: bool,
    /// Whether trace's main flows need it. An optional check never raises the
    /// launch notice; it's listed so the user knows it's available.
    pub required: bool,
    pub title: String,
    /// What was found (a path, a login) or what's wrong.
    pub detail: String,
    /// A short plain instruction, set only when the check failed.
    pub fix: Option<String>,
    /// What trace can do about it itself; only on a failed check.
    pub action: Option<Action>,
}

/// Whether `gh` is signed in, from `gh auth status --json hosts`.
#[derive(Debug, PartialEq, Eq)]
pub enum GhAuth {
    /// Signed in to github.com, as this login ("" when an old `gh` didn't say).
    SignedIn(String),
    SignedOut,
    /// `gh` didn't answer in time, or couldn't be started.
    Unknown(String),
}

/// Read `gh auth status --json hosts`. The active working account wins; a
/// stored account whose token was revoked doesn't count. A `gh` older than
/// `--json` prints usage and fails, so its exit status is the answer instead
/// (`gh auth status` exits non-zero when nothing is signed in).
pub fn gh_auth_from(stdout: &str, success: bool) -> GhAuth {
    match parse_auth_status(stdout) {
        Ok(mut accounts) => {
            accounts.retain(|a| a.ok);
            accounts.sort_by_key(|a| !a.active);
            match accounts.into_iter().next() {
                Some(a) => GhAuth::SignedIn(a.login),
                None => GhAuth::SignedOut,
            }
        }
        Err(_) if success => GhAuth::SignedIn(String::new()),
        Err(_) => GhAuth::SignedOut,
    }
}

/// A check that a CLI was found, with its path as the detail.
pub fn tool_check(
    id: &'static str,
    tool: Tool,
    name: &str,
    required: bool,
    path: Option<String>,
) -> Check {
    match path {
        Some(path) => Check {
            id,
            ok: true,
            required,
            title: format!("{name} is installed"),
            detail: path,
            fix: None,
            action: None,
        },
        None => Check {
            id,
            ok: false,
            required,
            title: format!("{name} isn't installed"),
            detail: format!("trace couldn't find {id} on this computer."),
            fix: Some(install_hint(tool).to_string()),
            action: can_install(tool).then_some(Action::Install),
        },
    }
}

/// Whether Claude Code is signed in, from `claude auth status --json`.
#[derive(Debug, PartialEq, Eq)]
pub enum ClaudeAuth {
    SignedIn,
    SignedOut,
    /// No answer we could read (an older `claude` without `auth status`, or a
    /// slow one). Not held against the user: agents would show their own login.
    Unknown,
}

/// Read `claude auth status --json`: `{"loggedIn": true, …}`. An API key or a
/// token in the login shell's env counts as signed in, as Claude Code says.
pub fn claude_auth_from(stdout: &str) -> ClaudeAuth {
    match serde_json::from_str::<serde_json::Value>(stdout) {
        Ok(v) => match v.get("loggedIn").and_then(serde_json::Value::as_bool) {
            Some(true) => ClaudeAuth::SignedIn,
            Some(false) => ClaudeAuth::SignedOut,
            None => ClaudeAuth::Unknown,
        },
        Err(_) => ClaudeAuth::Unknown,
    }
}

/// The Claude Code check: installed, and signed in. An agent started before
/// signing in would stop at a login screen instead of working.
pub fn claude_check(path: Option<String>, auth: ClaudeAuth) -> Check {
    let found = tool_check("claude", Tool::Claude, "Claude Code", true, path);
    if !found.ok || auth != ClaudeAuth::SignedOut {
        return found;
    }
    Check {
        id: "claude",
        ok: false,
        required: true,
        title: "Claude Code isn't signed in".to_string(),
        detail: "Claude Code is installed, but no Claude account is signed in yet.".to_string(),
        fix: Some("Click Sign in, or run claude auth login in a terminal.".to_string()),
        action: Some(Action::SignIn),
    }
}

/// The GitHub CLI check: installed, and signed in. PR watching, checks and
/// review threads run through `gh`.
pub fn gh_check(path: Option<String>, auth: GhAuth) -> Check {
    let Some(path) = path else {
        let mut check = tool_check("gh", Tool::Gh, "GitHub CLI", true, None);
        check.detail = "trace needs gh to follow pull requests and their checks.".to_string();
        return check;
    };
    let failed = |title: &str, detail: String, fix: &str, action: Option<Action>| Check {
        id: "gh",
        ok: false,
        required: true,
        title: title.to_string(),
        detail,
        fix: Some(fix.to_string()),
        action,
    };
    match auth {
        GhAuth::SignedIn(login) => Check {
            id: "gh",
            ok: true,
            required: true,
            title: "GitHub CLI is signed in".to_string(),
            detail: if login.is_empty() {
                path
            } else {
                format!("Signed in as {login}")
            },
            fix: None,
            action: None,
        },
        GhAuth::SignedOut => failed(
            "GitHub CLI isn't signed in",
            "gh is installed, but no GitHub account is signed in, so pull requests can't be followed."
                .to_string(),
            "Click Sign in, or run gh auth login in a terminal, then check again.",
            Some(Action::SignIn),
        ),
        GhAuth::Unknown(why) => failed(
            "Couldn't check the GitHub CLI",
            why,
            "Run gh auth status in a terminal to see what's wrong, then check again.",
            None,
        ),
    }
}

/// The placeholder for checks that didn't report back before the deadline.
pub fn timed_out(id: &'static str, name: &str, required: bool) -> Check {
    Check {
        id,
        ok: false,
        required,
        title: format!("Couldn't check {name}"),
        detail: "The check took too long. Your login shell may be slow to start.".to_string(),
        fix: Some("Check again in a moment.".to_string()),
        action: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_who_gh_is_signed_in_as() {
        let json = r#"{"hosts":{"github.com":[
            {"state":"success","active":false,"login":"work"},
            {"state":"success","active":true,"login":"me"}
        ]}}"#;
        assert_eq!(gh_auth_from(json, true), GhAuth::SignedIn("me".into()));
    }

    #[test]
    fn a_revoked_active_account_falls_back_to_a_working_one() {
        let json = r#"{"hosts":{"github.com":[
            {"state":"error","active":true,"login":"me"},
            {"state":"success","active":false,"login":"work"}
        ]}}"#;
        // gh exits 1 when any account fails, but one still works.
        assert_eq!(gh_auth_from(json, false), GhAuth::SignedIn("work".into()));
    }

    #[test]
    fn no_working_account_is_signed_out() {
        assert_eq!(gh_auth_from(r#"{"hosts":{}}"#, false), GhAuth::SignedOut);
        let only_ghe = r#"{"hosts":{"ghe.corp":[{"state":"success","active":true,"login":"c"}]}}"#;
        assert_eq!(gh_auth_from(only_ghe, true), GhAuth::SignedOut);
        let revoked = r#"{"hosts":{"github.com":[{"state":"error","active":true,"login":"me"}]}}"#;
        assert_eq!(gh_auth_from(revoked, false), GhAuth::SignedOut);
    }

    #[test]
    fn an_old_gh_without_json_is_judged_by_its_exit_status() {
        let usage = "unknown flag: --json\nUsage: gh auth status [flags]";
        assert_eq!(gh_auth_from(usage, true), GhAuth::SignedIn(String::new()));
        assert_eq!(gh_auth_from(usage, false), GhAuth::SignedOut);
        assert_eq!(gh_auth_from("", false), GhAuth::SignedOut);
    }

    #[test]
    fn a_found_tool_passes_with_its_path_and_no_fix() {
        let c = tool_check("git", Tool::Git, "Git", true, Some("/usr/bin/git".into()));
        assert!(c.ok && c.required && c.fix.is_none());
        assert_eq!(c.detail, "/usr/bin/git");
    }

    #[test]
    fn a_missing_tool_fails_with_an_install_hint() {
        let c = tool_check("claude", Tool::Claude, "Claude Code", true, None);
        assert!(!c.ok);
        assert!(c.fix.unwrap().contains("Claude Code"));
        let codex = tool_check("codex", Tool::Codex, "Codex", false, None);
        assert!(!codex.ok && !codex.required);
    }

    #[test]
    fn gh_check_covers_missing_signed_out_and_signed_in() {
        let missing = gh_check(None, GhAuth::SignedOut);
        assert!(!missing.ok && missing.required);
        assert!(missing.fix.unwrap().contains("gh auth login"));

        let out = gh_check(Some("/opt/homebrew/bin/gh".into()), GhAuth::SignedOut);
        assert!(!out.ok);
        assert_eq!(out.title, "GitHub CLI isn't signed in");
        assert!(out.fix.unwrap().contains("gh auth login"));
        assert_eq!(out.action, Some(Action::SignIn));

        let ok = gh_check(Some("/bin/gh".into()), GhAuth::SignedIn("ron".into()));
        assert!(ok.ok && ok.fix.is_none());
        assert_eq!(ok.detail, "Signed in as ron");

        let old = gh_check(Some("/bin/gh".into()), GhAuth::SignedIn(String::new()));
        assert_eq!(old.detail, "/bin/gh");

        let slow = gh_check(Some("/bin/gh".into()), GhAuth::Unknown("timed out".into()));
        assert!(!slow.ok && slow.detail == "timed out");
    }

    #[test]
    fn a_missing_tool_offers_install_where_trace_can() {
        let claude = tool_check("claude", Tool::Claude, "Claude Code", true, None);
        let git = tool_check("git", Tool::Git, "Git", true, None);
        assert_eq!(git.action, None, "git needs the OS's own installer");
        if cfg!(any(target_os = "macos", target_os = "linux")) {
            assert_eq!(claude.action, Some(Action::Install));
        }
        let found = tool_check(
            "claude",
            Tool::Claude,
            "Claude Code",
            true,
            Some("/c".into()),
        );
        assert_eq!(found.action, None);
    }

    #[test]
    fn reads_whether_claude_is_signed_in() {
        assert_eq!(
            claude_auth_from(r#"{"loggedIn": true}"#),
            ClaudeAuth::SignedIn
        );
        assert_eq!(
            claude_auth_from(r#"{"loggedIn": false}"#),
            ClaudeAuth::SignedOut
        );
        assert_eq!(
            claude_auth_from("error: unknown command 'auth'"),
            ClaudeAuth::Unknown
        );
        assert_eq!(claude_auth_from(r#"{"other": 1}"#), ClaudeAuth::Unknown);
    }

    #[test]
    fn claude_check_asks_to_sign_in_only_when_known_signed_out() {
        let out = claude_check(Some("/c".into()), ClaudeAuth::SignedOut);
        assert!(!out.ok && out.required);
        assert_eq!(out.title, "Claude Code isn't signed in");
        assert_eq!(out.action, Some(Action::SignIn));

        assert!(claude_check(Some("/c".into()), ClaudeAuth::SignedIn).ok);
        assert!(claude_check(Some("/c".into()), ClaudeAuth::Unknown).ok);
        let missing = claude_check(None, ClaudeAuth::Unknown);
        assert_eq!(missing.title, "Claude Code isn't installed");
    }

    #[test]
    fn serialises_camel_case_for_the_renderer() {
        let v = serde_json::to_value(tool_check("git", Tool::Git, "Git", true, None)).unwrap();
        assert_eq!(v["id"], "git");
        assert_eq!(v["required"], true);
        assert!(v["fix"].is_string());
        let ok = serde_json::to_value(timed_out("gh", "GitHub CLI", true)).unwrap();
        assert_eq!(ok["ok"], false);
        let out = gh_check(Some("/bin/gh".into()), GhAuth::SignedOut);
        assert_eq!(serde_json::to_value(out).unwrap()["action"], "signIn");
    }
}
