//! Each workspace's agent options, in `agent-options.json` in the config dir
//! (user-only, through `helpers::persist`), like `transports.json`. A workspace
//! with nothing picked has no entry.

use std::collections::HashMap;
use std::path::PathBuf;

use super::AgentOptions;
use crate::helpers::persist::{self, Style};

fn file() -> PathBuf {
    crate::helpers::trace_dir().join("agent-options.json")
}

fn update<R>(f: impl FnOnce(&mut HashMap<String, AgentOptions>) -> R) -> Result<R, String> {
    persist::update(&file(), Style::Compact, f)
}

/// The options picked for a workspace; empty when none were.
pub fn stored(workspace_id: &str) -> AgentOptions {
    persist::read_or_log::<HashMap<String, AgentOptions>>(&file())
        .remove(workspace_id)
        .unwrap_or_default()
}

/// Remember a workspace's options. Only written when they change.
pub fn save(workspace_id: &str, options: &AgentOptions) -> Result<(), String> {
    if stored(workspace_id) == *options {
        return Ok(());
    }
    update(|map| {
        if options.is_empty() {
            map.remove(workspace_id);
        } else {
            map.insert(workspace_id.to_string(), options.clone());
        }
    })
}

/// The workspace is gone for good.
pub fn forget(workspace_id: &str) {
    if stored(workspace_id).is_empty() {
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
    if stored(from).is_empty() {
        return;
    }
    if let Err(e) = update(|map| {
        if let Some(o) = map.remove(from) {
            map.insert(to.to_string(), o);
        }
    }) {
        eprintln!("trace: {e}");
    }
}
