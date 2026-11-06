//! The Windows adapter. Agents run natively, with Git Bash behind Claude's hooks and
//! Bash tool, which is why trace's relay scripts stay bash here too.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

use super::ports::{
    AgentBridge, AgentEnvironment, Editor, EditorLauncher, Launcher, PrivateFiles, ProcessHost,
    SoundFolder, SoundPlayer, ToolLocator,
};
use super::{process, Os};

/// Stops a GUI app's child from opening a console window for each command.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

impl ProcessHost for Os {
    fn prepare(command: &mut Command) {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    fn is_alive(pid: u32) -> bool {
        // SAFETY: the handle is checked before use and closed on every path.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut code = 0;
            let ok = GetExitCodeProcess(handle, &mut code) != 0;
            CloseHandle(handle);
            ok && code == STILL_ACTIVE as u32
        }
    }

    fn stop_tree(pid: u32) {
        let _ = process::command("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }

    fn pty_reports_exit() -> bool {
        false
    }
}

/// Executable forms of `name`. A bare `name` is left out on purpose: npm puts a Unix
/// shell script called `claude` beside `claude.cmd`, and Windows can't run it.
fn executable_forms(name: &str) -> Vec<String> {
    if Path::new(name).extension().is_some() {
        return vec![name.to_string()];
    }
    ["exe", "cmd", "bat"]
        .iter()
        .map(|ext| format!("{name}.{ext}"))
        .collect()
}

fn in_dirs(dirs: &[PathBuf], name: &str) -> Vec<PathBuf> {
    let forms = executable_forms(name);
    dirs.iter()
        .flat_map(|dir| forms.iter().map(move |form| dir.join(form)))
        .collect()
}

fn env_dir(key: &str, suffix: &str) -> Option<PathBuf> {
    std::env::var_os(key).map(|root| PathBuf::from(root).join(suffix))
}

/// Git and the GitHub CLI's default install folders.
fn program_dirs() -> Vec<PathBuf> {
    [
        env_dir("ProgramFiles", "Git\\cmd"),
        env_dir("ProgramFiles", "GitHub CLI"),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn user_dirs(home: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![home.join(".local\\bin")];
    dirs.extend(env_dir("APPDATA", "npm"));
    dirs
}

impl ToolLocator for Os {
    fn executable_names(name: &str) -> Vec<String> {
        executable_forms(name)
    }

    fn user_tool_paths(home: &Path, name: &str) -> Vec<PathBuf> {
        in_dirs(&user_dirs(home), name)
    }

    fn system_tool_paths(name: &str) -> Vec<PathBuf> {
        in_dirs(&program_dirs(), name)
    }

    fn project_wrapper(dir: &Path, name: &str) -> PathBuf {
        dir.join(format!("{name}.bat"))
    }

    /// A pseudo console runs executables directly, so a batch file (how npm installs
    /// CLIs) goes through the command interpreter.
    fn pty_invocation(tool: &str) -> Vec<String> {
        let lower = tool.to_ascii_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
            vec![shell, "/c".to_string(), tool.to_string()]
        } else {
            vec![tool.to_string()]
        }
    }
}

/// Windows variable names ignore case and `PATH` usually arrives as `Path`, which
/// would otherwise leave two competing entries once trace adds to it.
fn with_upper_path(vars: impl Iterator<Item = (String, String)>) -> HashMap<String, String> {
    vars.map(|(key, value)| {
        if key.eq_ignore_ascii_case("PATH") {
            ("PATH".to_string(), value)
        } else {
            (key, value)
        }
    })
    .collect()
}

impl AgentEnvironment for Os {
    /// There's no login shell to ask: a Windows app already inherits the user's env.
    fn capture_env() -> HashMap<String, String> {
        with_upper_path(std::env::vars())
    }

    fn extra_path_dirs(home: &Path) -> Vec<PathBuf> {
        let mut dirs = user_dirs(home);
        dirs.extend(program_dirs());
        dirs
    }

    fn default_shell() -> String {
        std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
    }
}

impl AgentBridge for Os {
    fn install_script(path: &Path, body: &str) -> io::Result<()> {
        fs::write(path, body)
    }

    /// Git Bash reads `C:/Users/...`, where backslashes would be escapes.
    fn shell_path(path: &Path) -> String {
        path.to_string_lossy().replace('\\', "/")
    }
}

/// `S-1-5-21-...`, the current user's security identifier. Safer in an ACL than a
/// name, which depends on locale and domain.
fn current_user_sid() -> Option<String> {
    let out = process::command("whoami")
        .args(["/user", "/fo", "csv", "/nh"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    parse_sid(&text)
}

fn parse_sid(whoami_csv: &str) -> Option<String> {
    let sid = whoami_csv
        .trim()
        .rsplit(',')
        .next()?
        .trim()
        .trim_matches('"');
    sid.starts_with("S-1-").then(|| sid.to_string())
}

impl PrivateFiles for Os {
    /// Files inherit the user-only ACL `restrict_dir` puts on the config dir.
    fn owner_only_options() -> OpenOptions {
        OpenOptions::new()
    }

    fn restrict_file(_path: &Path) {}

    /// Replace inherited access with the current user alone, for the folder and what's
    /// already in it. New files then inherit this, so each write needs nothing extra.
    fn restrict_dir(path: &Path) {
        let Some(sid) = current_user_sid() else {
            tracing::warn!("couldn't read the current user's SID; config dir ACL unchanged");
            return;
        };
        let status = process::command("icacls")
            .arg(path)
            .args(["/inheritance:r", "/grant:r"])
            .arg(format!("*{sid}:(OI)(CI)F"))
            .args(["/T", "/C", "/Q"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if !status.is_ok_and(|s| s.success()) {
            tracing::warn!("couldn't restrict the config dir's ACL");
        }
    }
}

impl SoundPlayer for Os {
    fn sound_folders(_home: &Path) -> Vec<SoundFolder> {
        env_dir("WINDIR", "Media")
            .into_iter()
            .map(|path| SoundFolder {
                path,
                source: "system",
            })
            .collect()
    }

    /// All .NET's built-in player reads.
    fn audio_extensions() -> &'static [&'static str] {
        &["wav"]
    }

    /// The path travels by env var, so it can't be read as PowerShell code.
    fn play(path: &Path) -> io::Result<Child> {
        process::command("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "(New-Object Media.SoundPlayer $env:TRACE_SOUND).PlaySync()",
            ])
            .env("TRACE_SOUND", path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
    }
}

impl EditorLauncher for Os {
    fn launchers(editor: Editor) -> Vec<Launcher> {
        match editor {
            Editor::VsCode => vec![("code", &[]), ("code-insiders", &[])],
            Editor::IntelliJ => vec![("idea", &[]), ("idea64.exe", &[])],
            Editor::Cursor => vec![("cursor", &[])],
        }
    }
}

#[cfg(test)]
#[path = "windows_tests.rs"]
mod tests;
