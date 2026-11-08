//! This machine as an [`AgentHost`]: the `portable-pty` transport in
//! `claude/pty.rs`, unchanged, behind the port.

use tauri::AppHandle;

use super::{AgentHost, AgentSession, Capabilities, HostError, LiveSession, SpawnSpec};
use crate::claude::pty::{spawn_agent_pty, PtySession};

/// Agents run beside trace, in a PTY of their own.
pub struct LocalHost;

impl AgentHost for LocalHost {
    fn capabilities(&self) -> Capabilities {
        Capabilities::ALL
    }

    fn spawn(&self, app: &AppHandle, spec: SpawnSpec) -> Result<LiveSession, HostError> {
        let (session, _pid) = spawn_agent_pty(
            app.clone(),
            spec.workspace_id,
            spec.cwd,
            spec.cli,
            spec.resume_id,
            spec.new_session_id,
            spec.model,
            spec.extra_args,
            spec.prompt,
            spec.env,
            spec.cols,
            spec.rows,
        )
        .map_err(HostError::Spawn)?;
        Ok(Box::new(session))
    }
}

impl AgentSession for PtySession {
    fn write_input(&mut self, data: &[u8]) -> std::io::Result<()> {
        PtySession::write_input(self, data)
    }

    fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        PtySession::resize(self, cols, rows)
    }

    fn pid(&self) -> Option<u32> {
        PtySession::pid(self)
    }

    fn stop(&mut self) {
        self.kill();
    }
}
