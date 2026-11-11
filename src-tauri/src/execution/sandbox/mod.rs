//! Agents in a cloud sandbox. [`SandboxProvider`] is what a vendor gives
//! (create, run a command, open a PTY); [`host::SandboxHost`] does the rest the
//! same way for every vendor: check the repo out, start the agent in tmux, and
//! attach a terminal to it. Vercel is the first provider (`execution::vercel`);
//! E2B, Daytona, Modal or a plain SSH box would be another file like it.
//!
//! The agent runs in a tmux session, so it outlives any one viewer: closing
//! trace detaches, and any trace with the same provider account can attach.

mod acquire;
pub mod chat;
mod chat_offsets;
pub mod egress;
pub mod events;
pub mod files;
pub mod helpers;
pub mod host;
pub mod lifetime;
pub mod preview;
pub mod prs;
mod ready;
pub mod script;
pub mod session;
mod setup;
pub mod size;
mod watch;

use std::collections::HashMap;
use std::time::Duration;

/// The tmux session an agent runs in, one per sandbox.
pub const TMUX_SESSION: &str = "trace";

/// What a new sandbox is made with.
#[derive(Debug, Clone)]
pub struct SandboxSpec {
    /// Unique per provider project, so it doubles as the lookup key.
    pub name: String,
    /// Key/value labels `list` filters on (Vercel calls them tags).
    pub labels: Vec<(String, String)>,
    /// How long it may run before the provider stops it.
    pub timeout: Duration,
    /// Ports a server in it can be reached on from outside (`Preview`).
    pub ports: Vec<u16>,
}

/// Ports a sandbox is made with, for the dev servers agents usually start
/// (Next and most Node servers, Vite, everything else). Each gets a public URL.
pub const PREVIEW_PORTS: [u16; 3] = [3000, 5173, 8080];

/// What lets a sandbox keep itself running while its agent works and stop
/// itself once idle: the provider's API, for its own session alone.
#[derive(Debug, Clone)]
pub struct SelfService {
    /// The token, added by the network for exactly these calls.
    pub injections: Vec<egress::Injection>,
    /// POST `{"duration": ms}` for more time.
    pub extend_url: String,
    /// POST to stop, which saves it.
    pub stop_url: String,
}

/// A sandbox port reachable from outside, at a public URL.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub port: u16,
    pub url: String,
}

/// A sandbox as a provider reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxInfo {
    pub name: String,
    /// The provider's own word: "running", "pending", "stopped", …
    pub status: String,
    /// The current run of the sandbox, which commands and PTYs address.
    pub session_id: Option<String>,
    pub labels: HashMap<String, String>,
    /// Epoch milliseconds.
    pub created_at: u64,
    /// Kept as a snapshot when it stops, so [`SandboxProvider::resume`] brings
    /// its files back.
    pub persistent: bool,
    /// It has a snapshot to resume from (stopped and saved, not expired).
    pub saved: bool,
    /// Epoch ms when the provider stops the current run, if it says (a get
    /// reports it; a list doesn't). Keep-alive moves it on while attached.
    pub stops_at: Option<u64>,
    /// Epoch ms when its snapshot expires, if it has one and the provider says.
    pub saved_until: Option<u64>,
    /// Its ports' public URLs, when the provider says (a get does; a list doesn't).
    pub previews: Vec<Preview>,
}

impl SandboxInfo {
    pub fn is_running(&self) -> bool {
        self.status == "running"
    }
}

/// A finished command.
#[derive(Debug, Clone, Default)]
pub struct ExecOutput {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl ExecOutput {
    pub fn ok(&self) -> bool {
        self.exit_code == Some(0)
    }
}

/// What a read from a sandbox PTY gave.
#[derive(Debug, PartialEq, Eq)]
pub enum PtyRead {
    Data(Vec<u8>),
    /// Nothing within the read's short wait. Poll again.
    Idle,
    /// The command ended, or the connection closed after saying so.
    Ended,
    /// The connection broke. The agent may still be running in tmux.
    Failed(String),
}

/// A piece of a background command's output.
#[derive(Debug, PartialEq, Eq)]
pub enum Output {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
}

/// A command's output as it comes, from its start; ends with the command.
pub type OutputStream = Box<dyn Iterator<Item = Output> + Send>;

/// A terminal on a command inside a sandbox. Reads wait only briefly, so one
/// thread can both read and write it.
pub trait PtyStream: Send {
    fn send_input(&mut self, data: &[u8]) -> Result<(), String>;
    fn send_resize(&mut self, cols: u16, rows: u16) -> Result<(), String>;
    fn read(&mut self) -> PtyRead;
    fn close(&mut self);
}

/// What a sandbox vendor provides. Blocking: called from a session's own
/// thread or from `spawn_blocking`, never on the async runtime.
pub trait SandboxProvider: Send + Sync + 'static {
    /// Shown to the user: "Vercel".
    fn label(&self) -> &'static str;
    /// A handle of its own, for a thread that outlives the caller (`watch`).
    fn shared(&self) -> std::sync::Arc<dyn SandboxProvider>;
    /// The home directory in its sandboxes, where repos are cloned.
    fn home(&self) -> &'static str;
    /// A persistent sandbox: stopping it keeps a snapshot to resume from.
    fn create(&self, spec: &SandboxSpec) -> Result<SandboxInfo, String>;
    fn find(&self, name: &str) -> Result<Option<SandboxInfo>, String>;
    /// Start a stopped persistent sandbox again from its snapshot: its files
    /// are back, its processes aren't.
    fn resume(&self, name: &str) -> Result<SandboxInfo, String>;
    /// Every sandbox carrying the label `key=value`.
    fn list(&self, key: &str, value: &str) -> Result<Vec<SandboxInfo>, String>;
    /// Delete a stopped sandbox so its name can be used again.
    fn remove(&self, name: &str) -> Result<(), String>;
    /// Run a command to completion. `env` is the way secrets go in: it isn't
    /// part of the command line a provider shows or logs.
    fn exec(
        &self,
        session_id: &str,
        argv: &[String],
        env: &HashMap<String, String>,
    ) -> Result<ExecOutput, String>;
    fn open_pty(
        &self,
        session_id: &str,
        argv: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Box<dyn PtyStream>, String>;
    /// Start a command in the background with its stdin open to
    /// [`Self::write_stdin`]: how a chat agent runs (`chat`). Returns its id.
    fn start_command(
        &self,
        session_id: &str,
        argv: &[String],
        env: &HashMap<String, String>,
        cwd: &str,
    ) -> Result<String, String>;
    fn write_stdin(&self, session_id: &str, command_id: &str, data: &[u8]) -> Result<(), String>;
    fn close_stdin(&self, session_id: &str, command_id: &str) -> Result<(), String>;
    /// Its output from the start, then as it comes, until it ends.
    fn command_output(&self, session_id: &str, command_id: &str) -> Result<OutputStream, String>;
    fn kill_command(&self, session_id: &str, command_id: &str) -> Result<(), String>;
    /// Whether it has ended (without waiting).
    fn command_done(&self, session_id: &str, command_id: &str) -> Result<bool, String>;
    /// Wait for it to end: its exit code, when the provider knows it.
    fn wait_command(&self, session_id: &str, command_id: &str) -> Result<Option<i32>, String>;
    /// Have the sandbox's network add these credentials to its outgoing
    /// requests, for this run and every later one (`egress`). Err when the
    /// provider or the plan can't, and the caller falls back to env.
    fn set_egress(
        &self,
        name: &str,
        session_id: &str,
        egress: &egress::Egress,
    ) -> Result<(), String>;
    /// Expose exactly these ports (`Preview`), on the running session and
    /// every later one: for a sandbox made before it had them.
    fn set_ports(&self, name: &str, ports: &[u16]) -> Result<Vec<Preview>, String>;
    /// How a sandbox calls the provider about itself (`helpers`'
    /// `trace-keepalive`), with nothing of trace's running: None when it can't.
    fn self_service(&self, session_id: &str) -> Option<SelfService>;
    /// Ask for more time, within the plan's limit.
    fn extend(&self, session_id: &str, by: Duration) -> Result<(), String>;
    fn stop(&self, session_id: &str) -> Result<(), String>;
}
