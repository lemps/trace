//! Agents run headless over a structured protocol, shown as a chat. See
//! docs/AGENT_CHAT.md.
//!
//! - `journal`: the rows every brand's conversation becomes, and what the UI renders.
//! - An adapter per brand implements `AgentAdapter` and turns its protocol into rows.
//!
//! This is the contract the runtime and the UI are built against; the runtime
//! (process handling, persistence, commands) and the adapters live beside it.
//!
//! - `registry`: the chat agents, starting, running or stopping.
//! - `runtime`: starting and driving them, and the sink that persists and emits rows.
//! - `store`: the journal file; `settle`: rows a vanished process left open.
//! - `transport`: whether each workspace runs as a chat or in the terminal.
//! - `claude`, `codex`: the adapters; `brands` picks one by its CLI.
//! - `attachments`: files sent with a message (pasted ones saved to disk first).

pub mod attachments;
pub mod brands;
pub mod claude;
pub mod codex;
pub mod journal;
pub mod process;
pub mod registry;
pub mod runtime;
pub mod settle;
pub mod store;
pub mod subagent;
pub mod transport;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use journal::{Answer, JournalRow};

/// What a chat agent is started with. Brand-neutral; an adapter maps it to flags.
#[derive(Clone, Debug)]
pub struct LaunchSpec {
    pub workspace_id: String,
    pub cwd: PathBuf,
    pub model: Option<String>,
    /// The agent's own conversation id to resume, if it has one saved.
    pub resume: Option<String>,
    /// Flags from Settings → Agents, appended as for a terminal agent.
    pub extra_args: Vec<String>,
    /// Extra environment (trace's render bridge, a provider's endpoint, …).
    pub env: Vec<(String, String)>,
    /// The `seq` the adapter's first new row takes, continuing the journal: only
    /// the runtime has read it, and rows must keep their order across restarts.
    pub next_seq: u64,
}

/// A user turn.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMessage {
    pub text: String,
    /// Absolute paths of attached files or images.
    #[serde(default)]
    pub attachments: Vec<String>,
}

/// Facts about the running agent that aren't conversation rows.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The agent's own conversation id, saved for resuming.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub slash_commands: Vec<String>,
    /// Whether a turn is running.
    pub busy: bool,
    /// Subagents still working, including background ones that outlived their
    /// turn: the agent counts as working while there are any.
    #[serde(default)]
    pub running_subagents: u32,
    /// Usage-limit windows, as the agent reports them (e.g. "seven_day" → 0.31).
    #[serde(default)]
    pub limits: Vec<LimitWindow>,
}

/// One usage-limit window, so the header can warn before the agent is cut off.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub name: String,
    /// 0.0–1.0.
    pub utilization: f64,
    /// Unix seconds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resets_at: Option<u64>,
}

/// Where an adapter sends what it learns. The runtime implements it: it persists
/// rows and emits them to the renderer.
pub trait JournalSink: Send + Sync {
    /// Add or replace a row (by `id`, keeping the higher `revision`).
    fn row(&self, row: JournalRow);
    fn info(&self, info: SessionInfo);
    /// The agent process ended; `reason` says why when it wasn't asked to.
    fn exited(&self, reason: Option<String>);
}

/// One running agent of some brand. Methods return quickly: results arrive as rows.
pub trait AgentAdapter: Send {
    /// Start a user turn.
    fn send(&mut self, message: UserMessage) -> Result<(), String>;
    /// Resolve an approval or question row by its `request_id`.
    fn answer(&mut self, request_id: &str, answer: Answer) -> Result<(), String>;
    /// Stop the current turn and keep the agent. Running subagents stop too,
    /// background ones included.
    fn interrupt(&mut self) -> Result<(), String>;
    /// Stop one subagent, named by the call that started it.
    fn stop_subagent(&mut self, _call_id: &str) -> Result<(), String> {
        Err("This agent can't stop one subagent on its own.".to_string())
    }
    /// End the agent.
    fn stop(&mut self);
    /// Let go of the agent and leave it running where it is (a cloud sandbox),
    /// for a later start to rejoin. False when it can't outlive trace here.
    fn detach(&mut self) -> bool {
        false
    }
    /// The agent's process id, for the interrupted-agents ledger.
    fn pid(&self) -> Option<u32> {
        None
    }
}
