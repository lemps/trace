//! The chat agents trace is running: a registry in `AppState`, and the
//! `JournalSink` each adapter writes to, which appends rows to the workspace's
//! journal (`store`) and emits them to the renderer.
//!
//! Locking: the registry is one mutex, and nothing is called while it's held
//! except an adapter method, which only queues a message for the adapter's own
//! thread. That thread reaches the registry (an agent ending) holding nothing.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::claude::ClaudeAdapter;
use super::journal::{Answer, JournalBody, JournalRow};
use super::{settle, store, AgentAdapter, JournalSink, LaunchSpec, SessionInfo, UserMessage};
use crate::state::AppState;

/// Running chat agents by workspace id.
#[derive(Default)]
pub struct ChatAgents {
    inner: Mutex<Registry>,
    next_instance: AtomicU64,
}

#[derive(Default)]
struct Registry {
    agents: HashMap<String, Live>,
    /// Instances being launched, not yet registered.
    launching: HashSet<u64>,
    /// Launching instances whose process already ended.
    ended_early: HashSet<u64>,
}

struct Live {
    instance: u64,
    adapter: Box<dyn AgentAdapter>,
}

impl ChatAgents {
    pub fn is_running(&self, workspace_id: &str) -> bool {
        self.inner.lock().agents.contains_key(workspace_id)
    }

    /// Run `f` on a workspace's adapter.
    fn with<R>(
        &self,
        workspace_id: &str,
        f: impl FnOnce(&mut dyn AgentAdapter) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut inner = self.inner.lock();
        let live = inner
            .agents
            .get_mut(workspace_id)
            .ok_or("This agent isn't running.")?;
        f(live.adapter.as_mut())
    }

    fn launching(&self) -> u64 {
        let instance = self.next_instance.fetch_add(1, Ordering::Relaxed);
        self.inner.lock().launching.insert(instance);
        instance
    }

    /// Register a launched instance, or drop it if its process already ended.
    /// `None`: the launch failed.
    fn register(&self, workspace_id: &str, instance: u64, adapter: Option<Box<dyn AgentAdapter>>) {
        let mut inner = self.inner.lock();
        inner.launching.remove(&instance);
        let Some(adapter) = adapter else { return };
        if inner.ended_early.remove(&instance) {
            return;
        }
        inner
            .agents
            .insert(workspace_id.to_string(), Live { instance, adapter });
    }

    /// Forget an instance whose process ended, unless a newer one took its place.
    fn ended(&self, workspace_id: &str, instance: u64) {
        let mut inner = self.inner.lock();
        match inner.agents.get(workspace_id) {
            Some(live) if live.instance == instance => {
                inner.agents.remove(workspace_id);
            }
            _ if inner.launching.contains(&instance) => {
                inner.ended_early.insert(instance);
            }
            _ => {}
        }
    }

    fn take(&self, workspace_id: &str) -> Option<Box<dyn AgentAdapter>> {
        self.inner
            .lock()
            .agents
            .remove(workspace_id)
            .map(|live| live.adapter)
    }
}

/// `agent-journal`'s payload (`JournalEvent` in types.ts).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JournalEvent<'a> {
    workspace_id: &'a str,
    rows: Vec<JournalRow>,
}

/// `agent-session-info`'s payload (`SessionInfoEvent` in types.ts).
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfoEvent<'a> {
    workspace_id: &'a str,
    info: SessionInfo,
}

struct Sink {
    app: AppHandle,
    workspace_id: String,
    path: PathBuf,
    instance: u64,
}

impl JournalSink for Sink {
    fn row(&self, row: JournalRow) {
        // Streaming text changes with every token: only its final revision is
        // kept, or a long answer would be written out once per word.
        let streaming = matches!(&row.body, JournalBody::Message(m) if m.streaming);
        if !streaming {
            if let Err(e) = store::append(&self.path, &row) {
                eprintln!("trace: {e}");
            }
        }
        let event = JournalEvent {
            workspace_id: &self.workspace_id,
            rows: vec![row],
        };
        let _ = self.app.emit("agent-journal", event);
    }

    fn info(&self, info: SessionInfo) {
        let event = SessionInfoEvent {
            workspace_id: &self.workspace_id,
            info,
        };
        let _ = self.app.emit("agent-session-info", event);
    }

    fn exited(&self, _reason: Option<String>) {
        // The reason is already a status row; the registry just lets go.
        let state = self.app.state::<AppState>();
        state.chat_agents.ended(&self.workspace_id, self.instance);
    }
}

/// What a chat agent is started with, before trace adds its own wiring.
pub struct StartRequest {
    pub workspace_id: String,
    pub cwd: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub extra_args: Vec<String>,
}

/// Start a Claude chat agent for `req.workspace_id`. A no-op if one runs.
pub fn start(app: &AppHandle, state: &AppState, req: StartRequest) -> Result<(), String> {
    let agents = &state.chat_agents;
    if agents.is_running(&req.workspace_id) {
        return Ok(());
    }
    let wiring = crate::claude::launch::claude_wiring(
        app,
        state,
        &req.workspace_id,
        req.model,
        req.provider.as_deref(),
        req.extra_args,
    )?;
    let path = store::journal_path(&req.workspace_id);
    let rows = store::load_compacted(&path)?;
    // The last run's open rows end now, on disk too, before this run adds to them.
    for row in settle::settle(&rows) {
        store::append(&path, &row)?;
    }
    let spec = LaunchSpec {
        workspace_id: req.workspace_id.clone(),
        cwd: PathBuf::from(&req.cwd),
        model: wiring.model,
        resume: None,
        extra_args: wiring.extra_args,
        env: wiring.env.into_iter().collect(),
        next_seq: store::next_seq(&rows),
    };
    let instance = agents.launching();
    let sink = Arc::new(Sink {
        app: app.clone(),
        workspace_id: req.workspace_id.clone(),
        path,
        instance,
    });
    match ClaudeAdapter::launch(spec, sink) {
        Ok(adapter) => {
            agents.register(&req.workspace_id, instance, Some(Box::new(adapter)));
            Ok(())
        }
        Err(e) => {
            agents.register(&req.workspace_id, instance, None);
            Err(e)
        }
    }
}

pub fn send(state: &AppState, workspace_id: &str, message: UserMessage) -> Result<(), String> {
    state.chat_agents.with(workspace_id, |a| a.send(message))
}

pub fn answer(
    state: &AppState,
    workspace_id: &str,
    request_id: &str,
    answer: Answer,
) -> Result<(), String> {
    state
        .chat_agents
        .with(workspace_id, |a| a.answer(request_id, answer))
}

pub fn interrupt(state: &AppState, workspace_id: &str) -> Result<(), String> {
    state.chat_agents.with(workspace_id, |a| a.interrupt())
}

/// End a workspace's chat agent. Its exit settles what it left open.
pub fn stop(state: &AppState, workspace_id: &str) {
    if let Some(mut adapter) = state.chat_agents.take(workspace_id) {
        adapter.stop();
    }
}

/// A workspace's journal. While no agent runs, rows it left open read as ended.
pub fn load(state: &AppState, workspace_id: &str) -> Result<Vec<JournalRow>, String> {
    let rows = store::load(&store::journal_path(workspace_id))?;
    if state.chat_agents.is_running(workspace_id) {
        Ok(rows)
    } else {
        Ok(settle::settled(rows))
    }
}
