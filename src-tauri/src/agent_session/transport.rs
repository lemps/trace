//! Which transport each workspace's agent runs on: the chat (headless, over a
//! structured protocol) or the terminal (the TUI in a PTY). Chosen when the
//! agent is first started (Settings' default, or the New session dialog / Start
//! menu), and kept so a restart, a resume or a resume-after-quit runs it the
//! same way. `transports.json` in the config dir, like `sessions.json`.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

/// How an agent is hosted. Serialised as `"chat"` / `"terminal"` (types.ts `Transport`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Transport {
    Chat,
    #[default]
    Terminal,
}

impl Transport {
    /// From the renderer's string; anything unknown is no choice at all.
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "chat" => Some(Self::Chat),
            "terminal" => Some(Self::Terminal),
            _ => None,
        }
    }
}

fn file() -> PathBuf {
    crate::helpers::trace_dir().join("transports.json")
}

fn update<R>(f: impl FnOnce(&mut HashMap<String, Transport>) -> R) -> Result<R, String> {
    persist::update(&file(), Style::Compact, f)
}

/// The transport a workspace's agent last ran on, if it has run.
pub fn stored(workspace_id: &str) -> Option<Transport> {
    persist::read_or_log::<HashMap<String, Transport>>(&file())
        .get(workspace_id)
        .copied()
}

/// Remember a workspace's transport. Only written when it changes.
pub fn remember(workspace_id: &str, transport: Transport) {
    if stored(workspace_id) == Some(transport) {
        return;
    }
    if let Err(e) = update(|map| {
        map.insert(workspace_id.to_string(), transport);
    }) {
        eprintln!("trace: {e}");
    }
}

/// The workspace is gone for good.
pub fn forget(workspace_id: &str) {
    if stored(workspace_id).is_none() {
        return;
    }
    if let Err(e) = update(|map| {
        map.remove(workspace_id);
    }) {
        eprintln!("trace: {e}");
    }
}

/// A session's conversation now belongs to an issue (`session_link`).
pub fn transfer(from: &str, to: &str) {
    if stored(from).is_none() {
        return;
    }
    if let Err(e) = update(|map| {
        if let Some(t) = map.remove(from) {
            map.insert(to.to_string(), t);
        }
    }) {
        eprintln!("trace: {e}");
    }
}

/// The transport a start uses: what the caller asked for, else what the
/// workspace ran on last, else the terminal. A brand without a chat adapter
/// always gets the terminal.
pub fn resolve(requested: Option<Transport>, stored: Option<Transport>, cli: &str) -> Transport {
    match requested.or(stored).unwrap_or_default() {
        Transport::Chat if super::brands::supports_chat(cli) => Transport::Chat,
        _ => Transport::Terminal,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_wins_then_the_stored_choice_then_the_terminal() {
        use Transport::*;
        assert_eq!(resolve(Some(Chat), Some(Terminal), "claude"), Chat);
        assert_eq!(resolve(Some(Terminal), Some(Chat), "claude"), Terminal);
        assert_eq!(resolve(None, Some(Chat), "claude"), Chat);
        assert_eq!(resolve(None, None, "claude"), Terminal);
    }

    #[test]
    fn a_brand_without_a_chat_adapter_runs_in_the_terminal() {
        assert_eq!(
            resolve(Some(Transport::Chat), None, "some-cli"),
            Transport::Terminal
        );
    }

    #[test]
    fn transports_read_as_the_renderer_writes_them() {
        assert_eq!(Transport::parse("chat"), Some(Transport::Chat));
        assert_eq!(Transport::parse("terminal"), Some(Transport::Terminal));
        assert_eq!(Transport::parse("tui"), None);
        let json = serde_json::to_string(&Transport::Chat).unwrap();
        assert_eq!(json, "\"chat\"");
    }
}
