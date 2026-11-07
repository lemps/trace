//! What macOS and Linux share: file modes, signals, login shells and script paths.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::ports::{AgentBridge, PrivateFiles};
use super::Os;

impl PrivateFiles for Os {
    fn owner_only_options() -> OpenOptions {
        let mut options = OpenOptions::new();
        options.mode(0o600);
        options
    }

    fn restrict_file(path: &Path) {
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }

    /// Nothing to do: every file is created `0600`.
    fn restrict_dir(_path: &Path) {}
}

impl AgentBridge for Os {
    fn install_script(path: &Path, body: &str) -> io::Result<()> {
        fs::write(path, body)?;
        // Holds no secret (it reads its token from the env), so 0755 is fine.
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))
    }

    fn shell_path(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }
}

/// Whether `pid` exists. Signal 0 checks without sending anything.
pub fn is_alive(pid: u32) -> bool {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return false;
    };
    unsafe { libc::kill(pid, 0) == 0 }
}

/// Start `command` as the leader of a new process group (its pgid = its pid).
pub fn own_group(command: &mut Command) {
    command.process_group(0);
}

/// SIGKILL the whole process group `pid` leads.
pub fn stop_group(pid: u32) {
    let Ok(pid) = libc::pid_t::try_from(pid) else {
        return;
    };
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

/// The user's login-shell environment, so an agent sees the same PATH, API keys and
/// tooling as in a terminal. Falls back to the process env if the probe yields nothing.
pub fn login_shell_env(fallback_shell: &str) -> HashMap<String, String> {
    let shell = default_shell(fallback_shell);
    let output = super::process::command(&shell)
        .args(["-lic", "printenv"])
        .env("DISABLE_AUTO_UPDATE", "true")
        .env("ZSH_DISABLE_COMPFIX", "true")
        .output();
    let map = parse_printenv(output_stdout(output).as_deref().unwrap_or(""));
    if map.is_empty() {
        std::env::vars().collect()
    } else {
        map
    }
}

fn output_stdout(output: io::Result<std::process::Output>) -> Option<String> {
    let out = output.ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn parse_printenv(stdout: &str) -> HashMap<String, String> {
    stdout
        .lines()
        .filter_map(|line| line.split_once('='))
        .filter(|(key, _)| !key.trim().is_empty())
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}

/// `$SHELL`, or `fallback` if it's unset.
pub fn default_shell(fallback: &str) -> String {
    std::env::var("SHELL").unwrap_or_else(|_| fallback.to_string())
}

/// `/bin/sh -c <line>`: POSIX sh, not the user's login shell, so a setup command
/// means the same thing for everyone. Its env comes from the caller.
pub fn shell_line(line: &str) -> Command {
    let mut command = super::process::command("/bin/sh");
    command.args(["-c", line]);
    command
}

/// `~/.local/bin/<name>`, plus the claude-style `~/.<name>/local/<name>` layout
/// (harmless for binaries that don't use it).
pub fn user_tool_paths(home: &Path, name: &str) -> Vec<PathBuf> {
    vec![
        home.join(".local/bin").join(name),
        home.join(format!(".{name}/local")).join(name),
    ]
}

/// Try each player in turn, moving on only if it isn't installed.
pub fn play_with(players: &[&str], path: &Path) -> io::Result<std::process::Child> {
    let mut last = io::Error::from(io::ErrorKind::NotFound);
    for player in players {
        let mut command: Command = super::process::command(player);
        match command.arg(path).spawn() {
            Ok(child) => return Ok(child),
            Err(e) if e.kind() == io::ErrorKind::NotFound => last = e,
            Err(e) => return Err(e),
        }
    }
    Err(last)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn printenv_output_keeps_values_with_equals_signs() {
        let map = parse_printenv("A=1\nB=x=y\nnot a var\n=skip\n");
        assert_eq!(map.get("A").map(String::as_str), Some("1"));
        assert_eq!(map.get("B").map(String::as_str), Some("x=y"));
        assert_eq!(map.len(), 2);
    }

    #[test]
    fn this_process_is_alive_and_a_silly_pid_is_not() {
        assert!(is_alive(std::process::id()));
        assert!(!is_alive(u32::MAX));
    }
}
