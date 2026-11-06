//! The user's auto-cleanup rules, persisted as `cleanup.json` (`0600`) in the
//! app config dir. Backend-owned because the sweep runs from a Rust thread
//! whether or not the Settings view was ever opened. Mirrored in
//! `src/ipc/cleanup.ts`.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};
use crate::helpers::trace_dir;

/// Which workspaces the rules apply to.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CleanupScope {
    Sessions,
    Tickets,
    Both,
}

impl CleanupScope {
    pub fn sessions(self) -> bool {
        matches!(self, CleanupScope::Sessions | CleanupScope::Both)
    }

    pub fn tickets(self) -> bool {
        matches!(self, CleanupScope::Tickets | CleanupScope::Both)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct CleanupSettings {
    /// Master switch. Off by default — deleting checkouts is opt-in.
    pub enabled: bool,
    /// How long a workspace must sit idle before it's deleted.
    pub after_hours: u32,
    pub scope: CleanupScope,
    /// Sessions qualify only once they're in the recycle bin.
    pub sessions_only_archived: bool,
    /// Tickets qualify only once their issue is in a Done-category status.
    pub tickets_only_done: bool,
}

impl Default for CleanupSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            after_hours: 7 * 24,
            scope: CleanupScope::Both,
            sessions_only_archived: true,
            tickets_only_done: true,
        }
    }
}

/// Shortest allowed idle period — anything less would reap a workspace whose
/// agent is merely between turns.
const MIN_HOURS: u32 = 1;
/// A year; longer is indistinguishable from "never".
const MAX_HOURS: u32 = 365 * 24;

impl CleanupSettings {
    /// Clamp what the UI sent into the supported range.
    pub fn sanitized(mut self) -> Self {
        self.after_hours = self.after_hours.clamp(MIN_HOURS, MAX_HOURS);
        self
    }

    pub fn after_secs(&self) -> u64 {
        u64::from(self.after_hours) * 60 * 60
    }
}

fn settings_file() -> PathBuf {
    trace_dir().join("cleanup.json")
}

/// The saved rules, or the defaults (off) when none were saved or the file was
/// corrupt. An error when the file can't be read: a sweep the user asked for mustn't
/// run on default rules that may be looser than theirs.
pub fn read() -> Result<CleanupSettings, String> {
    Ok(persist::read_json::<CleanupSettings>(&settings_file())?
        .map(CleanupSettings::sanitized)
        .unwrap_or_default())
}

/// [`read`] for the background sweep: any failure means the defaults (off), because
/// a bad file must never turn deletion *on*.
pub fn load() -> CleanupSettings {
    read().unwrap_or_else(|e| {
        eprintln!("trace: {e}");
        CleanupSettings::default()
    })
}

/// Replace the rules. Refuses if the current file can't be read.
pub fn save(settings: &CleanupSettings) -> Result<(), String> {
    persist::update(
        &settings_file(),
        Style::Pretty,
        |saved: &mut CleanupSettings| *saved = settings.clone(),
    )
}
