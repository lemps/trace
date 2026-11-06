//! The one place trace creates a process. Clippy's `disallowed-methods` (see
//! `clippy.toml`) sends everything else here, so `ProcessHost::prepare` can't be missed.
#![allow(clippy::disallowed_methods)]

use std::ffi::OsStr;
use std::process::Command;

use super::ports::ProcessHost;
use super::Os;

/// A `Command` for `program`, set up for this OS.
pub fn command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    Os::prepare(&mut command);
    command
}

/// [`command`] for tokio callers.
pub fn async_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(program);
    Os::prepare(command.as_std_mut());
    command
}
