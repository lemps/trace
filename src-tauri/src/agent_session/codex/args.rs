//! Settings → Agents flags for Codex are the TUI's (`-m`, `-a`, `-s`, `--yolo`,
//! `-c`), but `codex app-server` takes only config overrides: the rest are the
//! thread's settings in `thread/start`. This splits them, so the same flags
//! mean the same thing on either transport, and names those that mean nothing
//! here rather than letting app-server refuse to start.

use serde_json::{json, Map, Value};

/// What `thread/start` and `thread/resume` set. `None` leaves the user's
/// config.toml in charge, as a bare `codex` does.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ThreadSettings {
    pub cwd: String,
    pub model: Option<String>,
    pub approval_policy: Option<String>,
    pub sandbox: Option<String>,
}

impl ThreadSettings {
    pub fn params(&self) -> Value {
        let mut p = Map::new();
        p.insert("cwd".into(), json!(self.cwd));
        let fields = [
            ("model", &self.model),
            ("approvalPolicy", &self.approval_policy),
            ("sandbox", &self.sandbox),
        ];
        for (key, value) in fields {
            if let Some(v) = value {
                p.insert(key.into(), json!(v));
            }
        }
        Value::Object(p)
    }
}

/// `extra_args` split: flags for `codex app-server` itself, the thread's
/// settings, and flags dropped because app-server has no use for them.
#[derive(Debug, Default, PartialEq)]
pub struct Split {
    pub server_args: Vec<String>,
    pub settings: ThreadSettings,
    pub ignored: Vec<String>,
}

/// Split `extra_args` (Settings → Agents, appended after trace's own, so they
/// win) on top of `model` and `cwd`.
pub fn split(extra_args: &[String], model: Option<String>, cwd: String) -> Split {
    let mut s = Split {
        settings: ThreadSettings {
            cwd,
            model,
            ..ThreadSettings::default()
        },
        ..Split::default()
    };
    let mut args = extra_args.iter();
    while let Some(arg) = args.next() {
        let (flag, inline) = match arg.split_once('=') {
            Some((f, v)) if f.starts_with("--") => (f, Some(v.to_string())),
            _ => (arg.as_str(), None),
        };
        let mut value = || inline.clone().or_else(|| args.next().cloned());
        match flag {
            "-c" | "--config" | "--enable" | "--disable" => {
                if let Some(v) = value() {
                    s.server_args.extend([flag.to_string(), v]);
                }
            }
            "-m" | "--model" => s.settings.model = value().or(s.settings.model.take()),
            "-a" | "--ask-for-approval" => s.settings.approval_policy = value(),
            "-s" | "--sandbox" => s.settings.sandbox = value(),
            "--full-auto" => {
                s.settings.approval_policy = Some("on-request".into());
                s.settings.sandbox = Some("workspace-write".into());
            }
            "--dangerously-bypass-approvals-and-sandbox" | "--yolo" => {
                s.settings.approval_policy = Some("never".into());
                s.settings.sandbox = Some("danger-full-access".into());
            }
            _ => s.ignored.push(arg.clone()),
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn tui_flags_become_thread_settings_and_config_stays_a_flag() {
        let s = split(
            &args(&[
                "-a",
                "untrusted",
                "--sandbox=read-only",
                "-c",
                "x=1",
                "-m",
                "o9",
            ]),
            Some("gpt".into()),
            "/w".into(),
        );
        assert_eq!(s.server_args, args(&["-c", "x=1"]));
        assert_eq!(s.settings.model.as_deref(), Some("o9"));
        assert_eq!(s.settings.approval_policy.as_deref(), Some("untrusted"));
        assert_eq!(s.settings.sandbox.as_deref(), Some("read-only"));
        assert!(s.ignored.is_empty());
        assert_eq!(
            s.settings.params(),
            json!({"cwd": "/w", "model": "o9", "approvalPolicy": "untrusted", "sandbox": "read-only"})
        );
    }

    #[test]
    fn yolo_opens_everything_and_unknown_flags_are_named() {
        let s = split(&args(&["--yolo", "--search"]), None, "/w".into());
        assert_eq!(s.settings.approval_policy.as_deref(), Some("never"));
        assert_eq!(s.settings.sandbox.as_deref(), Some("danger-full-access"));
        assert_eq!(s.ignored, args(&["--search"]));
        assert_eq!(
            split(&[], None, "/w".into()).settings.params(),
            json!({"cwd": "/w"})
        );
    }
}
