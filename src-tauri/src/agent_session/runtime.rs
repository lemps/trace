//! Starting and driving chat agents (kept in `registry`), and the `JournalSink`
//! each adapter writes to, which appends rows to the workspace's journal
//! (`store`) and emits them to the renderer.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::claude::ClaudeAdapter;
use super::journal::{Answer, JournalBody, JournalRow};
use super::registry::Begin;
use super::{settle, store, JournalSink, LaunchSpec, SessionInfo, UserMessage};
use crate::state::AppState;

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
    pub model: Option<String>,
    pub provider: Option<String>,
    pub extra_args: Vec<String>,
}

/// Start a Claude chat agent for `req.workspace_id`, in the folder `cwd`
/// resolves (it may make a worktree, so it runs with the workspace claimed). A
/// no-op while one starts or runs.
pub fn start(
    app: &AppHandle,
    state: &AppState,
    req: StartRequest,
    cwd: impl FnOnce() -> Result<String, String>,
) -> Result<(), String> {
    let agents = &state.chat_agents;
    let Begin::Start(instance) = agents.begin(&req.workspace_id)? else {
        return Ok(());
    };
    let workspace_id = req.workspace_id.clone();
    let launched = (|| {
        let cwd = cwd()?;
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
            cwd: PathBuf::from(cwd),
            model: wiring.model,
            resume: None,
            extra_args: wiring.extra_args,
            env: wiring.env.into_iter().collect(),
            next_seq: store::next_seq(&rows),
        };
        let sink = Arc::new(Sink {
            app: app.clone(),
            workspace_id: req.workspace_id.clone(),
            path,
            instance,
        });
        ClaudeAdapter::launch(spec, sink)
    })();
    match launched {
        Ok(adapter) => {
            agents.register(&workspace_id, instance, Box::new(adapter));
            Ok(())
        }
        Err(e) => {
            agents.abandon(&workspace_id, instance);
            Err(e)
        }
    }
}

/// Send a user turn to a running agent.
pub fn send(state: &AppState, workspace_id: &str, message: UserMessage) -> Result<(), String> {
    state.chat_agents.with(workspace_id, |a| a.send(message))
}

/// Answer one of a running agent's approval or question rows.
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

/// Stop a running agent's current turn.
pub fn interrupt(state: &AppState, workspace_id: &str) -> Result<(), String> {
    state.chat_agents.with(workspace_id, |a| a.interrupt())
}

/// End a workspace's chat agent, or the one starting. Its exit settles what it
/// left open.
pub fn stop(state: &AppState, workspace_id: &str) {
    state.chat_agents.stop(workspace_id);
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
