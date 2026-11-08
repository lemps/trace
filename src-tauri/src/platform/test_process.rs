//! Processes for tests that need one to outlast a timeout.

use std::process::Command;

/// A command that runs for about five seconds and prints nothing.
pub fn slow() -> Command {
    #[cfg(unix)]
    let cmd = {
        let mut cmd = super::process::command("sleep");
        cmd.arg("5");
        cmd
    };
    #[cfg(windows)]
    let cmd = {
        let mut cmd = super::process::command("ping");
        cmd.args(["-n", "6", "127.0.0.1"]);
        cmd
    };
    cmd
}
