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

    /// A pseudo console runs executables directly, so a batch file needs help. The
    /// interpreter would split trace's JSON arguments at any `&`, so an npm install runs
    /// the program its shim points at instead. Other batch files have no alternative.
    fn pty_invocation(tool: &str) -> Vec<String> {
        let lower = tool.to_ascii_lowercase();
        if !lower.ends_with(".cmd") && !lower.ends_with(".bat") {
            return vec![tool.to_string()];
        }
        if let Some(argv) = npm_shim_argv(Path::new(tool)) {
            return argv;
        }
        let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        vec![shell, "/c".to_string(), tool.to_string()]
    }
}

/// The program in an npm shim's last line, relative to the shim:
/// `... "%_prog%"  "%dp0%\\node_modules\\pkg\\cli.js" %*`.
fn npm_shim_target(shim: &str) -> Option<String> {
    let target = regex::Regex::new(r#""%dp0%\\([^"]+)"\s+%\*"#).ok()?;
    Some(target.captures(shim)?[1].to_string())
}

/// How to run what an npm shim runs, without the shim.
fn npm_shim_argv(shim_path: &Path) -> Option<Vec<String>> {
    let dir = shim_path.parent()?;
    let target = dir.join(npm_shim_target(&fs::read_to_string(shim_path).ok()?)?);
    if !target.is_file() {
        return None;
    }
    let program = target.to_string_lossy().to_string();
    let is_script = target.extension().is_some_and(|ext| {
        ["js", "cjs", "mjs"]
            .iter()
            .any(|js| ext.eq_ignore_ascii_case(js))
    });
    if !is_script {
        return Some(vec![program]);
    }
    // The shim prefers a node.exe installed beside it, as a global npm install has.
    let local_node = dir.join("node.exe");
    let node = if local_node.is_file() {
        local_node.to_string_lossy().to_string()
    } else {
        "node".to_string()
    };
    Some(vec![node, program])
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

    /// Logged rather than returned: a failure mustn't stop trace from opening, but it
    /// leaves credentials readable by whatever the folder inherits.
    fn restrict_dir(path: &Path) {
        if let Err(reason) = restrict_acl(path) {
            tracing::warn!("couldn't restrict the config dir's ACL: {reason}");
        }
    }
}

/// Everyone, Authenticated Users and Users: who a folder can inherit access from.
const ORDINARY_USERS: [&str; 3] = ["*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"];
/// SYSTEM and Administrators keep access: like root on Unix, which `0600` doesn't stop,
/// they can take any file anyway, and backup and security tools run as them.
const ADMINS: [&str; 2] = ["*S-1-5-18", "*S-1-5-32-544"];

fn icacls(path: &Path, args: &[String]) -> Result<(), String> {
    let out = process::command("icacls")
        .arg(path)
        .args(args)
        .output()
        .map_err(|e| format!("couldn't run icacls: {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    Err(format!(
        "icacls: {} {}",
        String::from_utf8_lossy(&out.stdout).trim(),
        String::from_utf8_lossy(&out.stderr).trim()
    ))
}

/// The equivalent of `0600` for a folder and everything in it: no other ordinary user can
/// read it. New files inherit this, so each write needs nothing extra.
fn restrict_acl(path: &Path) -> Result<(), String> {
    let sid = current_user_sid().ok_or("couldn't read the current user's SID")?;
    let mut grant = vec!["/grant:r".to_string(), format!("*{sid}:(OI)(CI)F")];
    grant.extend(ADMINS.iter().map(|admin| format!("{admin}:(OI)(CI)F")));
    grant.extend([
        "/inheritance:r".to_string(),
        "/C".to_string(),
        "/Q".to_string(),
    ]);
    icacls(path, &grant)?;
    // Removing inheritance can leave what was inherited behind as explicit entries.
    let mut remove = vec!["/remove:g".to_string()];
    remove.extend(ORDINARY_USERS.iter().map(ToString::to_string));
    remove.extend(["/T".to_string(), "/C".to_string(), "/Q".to_string()]);
    icacls(path, &remove)
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
