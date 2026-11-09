//! The homepage clip recorder's hooks (`site/scripts/`), compiled only with the
//! `recording` Cargo feature. The release workflow never enables it, so a shipped
//! trace has none of this: it ignores the variables below and has no way to be
//! driven from outside.
//!
//! - A demo config dir (`TRACE_DEV_CONFIG_DIR`) in place of the user's, and a
//!   demo Conductor install (`TRACE_DEV_CONDUCTOR_DIR`) for the importer.
//! - Where the recorder's driver listens (`TRACE_RECORDING_PORT`, loopback only) and
//!   the token it expects (`TRACE_RECORDING_TOKEN`), handed to the page once.
//! - Frame capture of trace's own webview (`capture`), and stills that include the
//!   Browser tab's child webviews (`still`).

pub mod capture;
pub mod still;

use std::path::PathBuf;
use std::sync::OnceLock;

use serde::Serialize;

/// The recorder's driver: a WebSocket server on 127.0.0.1 that the page connects
/// to. The token is per run, checked on every message, and never logged or saved.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bridge {
    pub port: u16,
    pub token: String,
}

static BRIDGE: OnceLock<Option<Bridge>> = OnceLock::new();
static CONFIG_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
static CONDUCTOR_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Read the driver's address out of the environment and remove it, so no agent,
/// shell or hook trace spawns inherits the token. Runs first thing in `run()`,
/// before any other thread exists.
pub fn take_launch_env() {
    let port = std::env::var("TRACE_RECORDING_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok());
    // A short token is a mistake in the driver; refuse it rather than accept it.
    let token = std::env::var("TRACE_RECORDING_TOKEN")
        .ok()
        .filter(|t| t.len() >= 32);
    std::env::remove_var("TRACE_RECORDING_PORT");
    std::env::remove_var("TRACE_RECORDING_TOKEN");
    let _ = BRIDGE.set(port.zip(token).map(|(port, token)| Bridge { port, token }));
}

/// The driver to connect to, if trace was launched by the recorder.
pub fn bridge() -> Option<Bridge> {
    BRIDGE.get().cloned().flatten()
}

/// The demo config dir standing in for the OS config dir (`helpers::trace_dir`).
pub fn demo_config_dir() -> Option<PathBuf> {
    CONFIG_DIR
        .get_or_init(|| absolute_dir("TRACE_DEV_CONFIG_DIR"))
        .clone()
}

/// The demo folder standing in for Conductor's data and home folders
/// (`conductor_import`): `com.conductor.app/conductor.db`, `.conductor/`, and
/// `conductor/workspaces/` inside it.
pub fn demo_conductor_dir() -> Option<PathBuf> {
    CONDUCTOR_DIR
        .get_or_init(|| absolute_dir("TRACE_DEV_CONDUCTOR_DIR"))
        .clone()
}

/// An absolute folder from `var`. A relative one would depend on where trace was
/// started from, so it's ignored.
fn absolute_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
}
