//! Starting and driving chat agents (kept in `registry`), and the `JournalSink`
//! each adapter writes to, which appends rows to the workspace's journal
//! (`store`) and emits them to the renderer. A chat agent is listed in the
//! interrupted-agents ledger and reports its exit (`agent-run-state`) the same
//! way a terminal agent does, so the board, fleet and resume-after-quit see it.

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::journal::{Answer, JournalBody, JournalRow};
use super::registry::Begin;
use super::transport::Transport;
use super::{brands, settle, store, JournalSink, LaunchSpec, SessionInfo, UserMessage};
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
        // Plan mode and task lists become the Plan tab's documents (`plans`).
        crate::plans::on_row(&self.app, &self.workspace_id, &row);
        let event = JournalEvent {
            workspace_id: &self.workspace_id,
            rows: vec![row],
        };
        let _ = self.app.emit("agent-journal", event);
    }

    fn info(&self, info: SessionInfo) {
        let state = self.app.state::<AppState>();
        let was_working = state
            .chat_agents
            .info(&self.workspace_id)
            .is_some_and(|i| i.at_work());
        let info = state.chat_agents.note_info(&self.workspace_id, info);
        // What a resume after a quit needs to know: was it still at work. Not the
        // turn that ends because trace is going down: that one was cut off.
        let going_down = state
            .shutting_down
            .load(std::sync::atomic::Ordering::SeqCst);
        let now_working = info.at_work();
        if now_working != was_working && !going_down {
            crate::interrupted::record_busy(&self.workspace_id, now_working);
        }
        let event = SessionInfoEvent {
            workspace_id: &self.workspace_id,
            info,
        };
        let _ = self.app.emit("agent-session-info", event);
    }

    fn exited(&self, _reason: Option<String>) {
        // The reason is already a status row; the registry just lets go.
        let state = self.app.state::<AppState>();
        if !state.chat_agents.ended(&self.workspace_id, self.instance) {
            return;
        }
        // As a terminal agent's exit does (`claude::pty`).
        crate::interrupted::record_exit(&self.app, &self.workspace_id);
        let _ = self.app.emit(
            "agent-run-state",
            serde_json::json!({ "workspaceId": self.workspace_id, "running": false }),
        );
        crate::activity::record_agent(
            &self.app,
            &self.workspace_id,
            crate::activity::ActivityKind::AgentExit,
            "session ended",
            serde_json::Value::Null,
        );
    }
}

/// What a chat agent is started with, before trace adds its own wiring: the
/// same as a terminal agent (`commands::agent::spawn_in`).
pub struct StartRequest {
    pub workspace_id: String,
    /// The brand ("claude"); `brands` says which have a chat adapter.
    pub cli: String,
    pub cwd: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub extra_args: Vec<String>,
    /// The first message of a fresh conversation (a ticket's kickoff brief).
    pub initial_prompt: Option<String>,
    /// Sent instead when a saved conversation is resumed (`interrupted`).
    pub resume_prompt: Option<String>,
    /// Starts it on another host (a cloud sandbox); None runs it here.
    pub remote: Option<crate::agent_session::process::RemoteOpener>,
}

/// Start a chat agent for `req.workspace_id` in `req.cwd`. A no-op while one
/// starts or runs. Its first message, if any, is sent once it's up.
pub fn start(app: &AppHandle, state: &AppState, mut req: StartRequest) -> Result<(), String> {
    let agents = &state.chat_agents;
    // On another host only the host can tell a rejoin from a resume from a
    // fresh start, so it picks the first message (`execution::sandbox::chat`).
    let remote = req.remote.is_some();
    if let Some(open) = req.remote.take() {
        let (initial, resume) = (req.initial_prompt.clone(), req.resume_prompt.clone());
        req.remote = Some(Box::new(move |mut launch, say| {
            launch.initial_prompt = initial;
            launch.resume_prompt = resume;
            open(launch, say)
        }));
    }
    let Begin::Start(instance) = agents.begin(&req.workspace_id)? else {
        return Ok(());
    };
    let workspace_id = req.workspace_id.clone();
    let resume = brands::resumable(&req.cli, &req.workspace_id, &req.cwd);
    let prompt = if remote {
        None
    } else if resume.is_some() {
        req.resume_prompt.clone()
    } else {
        req.initial_prompt.clone()
    }
    .filter(|p| !p.trim().is_empty());
    // What the caller asked for, before trace's wiring: enough to start it
    // again after a quit (`interrupted`).
    let mut ledger = crate::interrupted::AgentLaunch {
        workspace_id: req.workspace_id.clone(),
        cwd: req.cwd.clone(),
        cli: req.cli.clone(),
        model: req.model.clone(),
        provider: req.provider.clone(),
        extra_args: req.extra_args.clone(),
        started_at: 0,
        pid: None,
        busy: prompt.is_some(),
        transport: Transport::Chat,
    };
    let launched = launch(app, state, req, instance, resume);
    let adapter = match launched {
        Ok(adapter) => adapter,
        Err(e) => {
            agents.abandon(&workspace_id, instance);
            return Err(e);
        }
    };
    ledger.pid = adapter.pid();
    let pid = ledger.pid;
    // A remote agent outlives a quit by itself, so it isn't "interrupted" by one.
    if !remote {
        crate::interrupted::record_start(ledger, pid);
    }
    if !agents.register(&workspace_id, instance, adapter) {
        // It exited before it was registered, so its exit didn't unlist it.
        crate::interrupted::record_exit(app, &workspace_id);
        return Err("The agent exited as soon as it started; its chat says why.".to_string());
    }
    if let Some(text) = prompt {
        // A stop during the start already ended it; then there's nobody to tell.
        let message = UserMessage {
            text,
            attachments: Vec::new(),
        };
        let _ = agents.with(&workspace_id, |a| a.send(message));
    }
    Ok(())
}

/// The adapter for `req`, with trace's wiring, continuing the journal on disk.
fn launch(
    app: &AppHandle,
    state: &AppState,
    req: StartRequest,
    instance: u64,
    resume: Option<String>,
) -> Result<Box<dyn super::AgentAdapter>, String> {
    // trace's loopback (tools, hooks, render bridge) can't reach another host:
    // an agent there gets only its provider's endpoint and model.
    let wiring = match &req.remote {
        Some(_) => crate::claude::launch::provider_wiring(
            req.model,
            req.provider.as_deref(),
            req.extra_args,
        )?,
        None => brands::wiring(
            app,
            state,
            &req.cli,
            &req.workspace_id,
            req.model,
            req.provider.as_deref(),
            req.extra_args,
        )?,
    };
    let path = store::journal_path(&req.workspace_id);
    let rows = store::load_compacted(&path)?;
    // The last run's open rows end now, on disk too, before this run adds to them.
    for row in settle::settle(&rows) {
        store::append(&path, &row)?;
    }
    let model = wiring.model.clone();
    let spec = LaunchSpec {
        workspace_id: req.workspace_id.clone(),
        cwd: PathBuf::from(&req.cwd),
        model: wiring.model,
        resume: resume.clone(),
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
    let adapter = brands::launch(&req.cli, spec, sink.clone(), req.remote)?;
    // The view knows it's a chat agent, and its model, before the first turn.
    sink.info(SessionInfo {
        agent: req.cli,
        model,
        conversation_id: resume,
        busy: false,
        ..SessionInfo::default()
    });
    Ok(adapter)
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

/// Stop one of a running agent's subagents, named by the call that started it.
pub fn stop_subagent(state: &AppState, workspace_id: &str, call_id: &str) -> Result<(), String> {
    state
        .chat_agents
        .with(workspace_id, |a| a.stop_subagent(call_id))
}

/// End a workspace's chat agent, or the one starting. Its exit settles what it
/// left open.
pub fn stop(state: &AppState, workspace_id: &str) {
    state.chat_agents.stop(workspace_id);
}

/// Let go of a workspace's chat agent and leave it running on its host (a
/// cloud sandbox). False for one that can't outlive trace.
pub fn detach(state: &AppState, workspace_id: &str) -> bool {
    state.chat_agents.detach(workspace_id)
}

/// trace is quitting: end every chat agent's process now, while trace can still
/// wait for it. Headless Claude doesn't exit on its own when its stdin closes in
/// the middle of a turn. Their ledger entries stay (`shutting_down` is set), so
/// the next launch offers them back.
pub fn stop_all_now(state: &AppState) {
    use crate::platform::ports::ProcessHost;
    let pids = state.chat_agents.pids();
    // Asked first, so each turn ends as interrupted rather than as a crash.
    // One on another host is left running there, for the next launch to rejoin.
    for id in state.chat_agents.workspaces() {
        if !state.chat_agents.detach(&id) {
            state.chat_agents.stop(&id);
        }
    }
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while !state.chat_agents.workspaces().is_empty() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    for pid in pids {
        if crate::platform::Os::is_alive(pid) {
            crate::platform::Os::stop_tree(pid);
        }
    }
}

/// What a view needs to know about a workspace's chat agent when it mounts:
/// `chat_agent_state`'s payload (`ChatAgentState` in types.ts).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAgentState {
    /// The transport its agent runs on, once it has run (or been chosen).
    pub transport: Option<Transport>,
    /// A chat agent is starting, running or stopping.
    pub running: bool,
    /// What it last reported, if one ran since trace started.
    pub info: Option<SessionInfo>,
}

/// The workspace's chat agent as it is now.
pub fn current(state: &AppState, workspace_id: &str) -> ChatAgentState {
    ChatAgentState {
        transport: super::transport::stored(workspace_id),
        running: state.chat_agents.is_running(workspace_id),
        info: state.chat_agents.info(workspace_id),
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

/// The workspace is gone for good: its journal and transport go with it.
pub fn forget(workspace_id: &str) {
    crate::helpers::persist::remove(&store::journal_path(workspace_id));
    super::transport::forget(workspace_id);
    crate::plans::forget(workspace_id);
    // Its live Browser pages close with the file.
    crate::browser::forget(workspace_id);
    crate::gallery::store::forget(workspace_id);
}

/// A session's conversation now belongs to an issue: so do its journal and transport.
pub fn transfer(from: &str, to: &str) {
    let (src, dst) = (store::journal_path(from), store::journal_path(to));
    if src.exists() && !dst.exists() {
        let _ = std::fs::rename(&src, &dst);
    }
    super::transport::transfer(from, to);
    crate::plans::transfer(from, to);
    crate::browser::transfer(from, to);
    crate::gallery::store::transfer(from, to);
}
