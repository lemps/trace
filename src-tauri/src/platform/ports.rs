//! What trace needs from the operating system, one trait per concern. Domain code
//! depends on these; `macos`, `linux` and `windows` implement them for [`super::Os`].
//!
//! Methods are associated functions because exactly one adapter is compiled into a
//! build: there is no state to hold and nothing to choose at runtime. Domain logic
//! that wants testing against a fake takes the port as a type parameter.

use std::fs::OpenOptions;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};

use std::collections::HashMap;

/// Starting and stopping processes.
pub trait ProcessHost {
    /// Applied to every process trace spawns: a GUI app's children mustn't flash a
    /// console on Windows, or inherit an AppImage's private libraries on Linux.
    fn prepare(command: &mut Command);

    /// Whether `pid` is still running. Decides if a ledger entry belongs to another
    /// running trace, so a wrong "alive" hides an interrupted agent.
    fn is_alive(pid: u32) -> bool;

    /// Stop what an agent started as well as the agent. A Unix PTY hangs up its whole
    /// session when it closes, but a Windows pseudo console leaves descendants running.
    fn stop_tree(pid: u32);

    /// Whether a PTY's reader sees EOF when its process exits. A pseudo console stays
    /// open until it's closed, so on Windows trace has to watch the process itself.
    fn pty_reports_exit() -> bool;

    /// Set `command` up so [`Self::track_group`] can reach everything it starts:
    /// stopping `sh -c` alone would leave its `curl` running.
    fn own_group(command: &mut Command);

    /// Right after spawning a command set up with [`Self::own_group`]: a handle
    /// that stops the child and everything it started — even once the child has
    /// exited and left a background process behind.
    fn track_group(child: &Child) -> ProcessGroup;
}

/// A spawned process's whole tree, stoppable at once ([`ProcessHost::track_group`]).
/// Dropping it doesn't stop anything.
pub struct ProcessGroup {
    stop: Box<dyn FnMut() + Send>,
}

impl ProcessGroup {
    /// A group stopped by `stop` (which owns whatever it needs to release).
    pub fn new(stop: impl FnMut() + Send + 'static) -> Self {
        Self {
            stop: Box::new(stop),
        }
    }

    /// Kill every process in the group. Safe to call more than once.
    pub fn stop(&mut self) {
        (self.stop)();
    }
}

/// Finding the CLIs trace runs (`claude`, `codex`, `git`, `gh`, …).
pub trait ToolLocator {
    /// File names that count as `name` when searching a directory.
    fn executable_names(name: &str) -> Vec<String>;

    /// Per-user install locations, checked before `PATH`.
    fn user_tool_paths(home: &Path, name: &str) -> Vec<PathBuf>;

    /// System install locations, checked after `PATH`: a GUI app can start with a
    /// `PATH` that's missing them.
    fn system_tool_paths(name: &str) -> Vec<PathBuf>;

    /// A project's own wrapper script, such as `gradlew`.
    fn project_wrapper(dir: &Path, name: &str) -> PathBuf;

    /// The program and leading arguments that run `tool` inside a PTY.
    fn pty_invocation(tool: &str) -> Vec<String>;

    /// Whether a binary found for `name` is one trace can use. An adapter can pass over
    /// a build that behaves differently, and the search carries on to the next match.
    fn is_usable(_name: &str, _path: &Path) -> bool {
        true
    }
}

/// The environment and shell agents run in.
pub trait AgentEnvironment {
    /// The variables an agent should start from: what the user sees in a terminal.
    fn capture_env() -> HashMap<String, String>;

    /// Directories added to `PATH`, so common install locations resolve.
    fn extra_path_dirs(home: &Path) -> Vec<PathBuf>;

    /// The shell behind the plain Terminal tab.
    fn default_shell() -> String;

    /// A command running `line` through the platform's plain command shell
    /// (`sh -c`, `cmd /C`) — how a repo's setup commands run in a new worktree.
    fn shell_line(line: &str) -> Command;
}

/// The scripts agents use to reach trace (`trace-hook`, `trace-render`).
pub trait AgentBridge {
    /// Write a bash script where agents can run it.
    fn install_script(path: &Path, body: &str) -> io::Result<()>;

    /// `path` as the shell that runs Claude's hooks expects to read it.
    fn shell_path(path: &Path) -> String;
}

/// Keeping trace's state files, which include credentials, to the current user.
pub trait PrivateFiles {
    /// Options that create a file user-only from its first instant, where the OS can.
    fn owner_only_options() -> OpenOptions;

    /// Make an existing file user-only.
    fn restrict_file(path: &Path);

    /// Make a directory, and everything in it, user-only. Run once at startup.
    fn restrict_dir(path: &Path);
}

/// A folder of notification sounds to offer.
pub struct SoundFolder {
    pub path: PathBuf,
    /// "system" or "you": where the sounds came from.
    pub source: &'static str,
}

/// Notification sounds.
pub trait SoundPlayer {
    fn sound_folders(home: &Path) -> Vec<SoundFolder>;

    /// Lowercase extensions the player can handle. Also the guard on a user-picked
    /// file: trace hands the path to a player, so it must be audio and nothing else.
    fn audio_extensions() -> &'static [&'static str];

    /// Start playing `path`. The caller reaps the child and never waits on the sound.
    fn play(path: &Path) -> io::Result<Child>;
}

/// The editors trace can open a workspace in.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Editor {
    VsCode,
    IntelliJ,
    Cursor,
}

/// A program and the arguments placed before the path being opened.
pub type Launcher = (&'static str, &'static [&'static str]);

/// Opening a folder in a desktop editor.
pub trait EditorLauncher {
    /// What to try for `editor`, best first.
    fn launchers(editor: Editor) -> Vec<Launcher>;
}
