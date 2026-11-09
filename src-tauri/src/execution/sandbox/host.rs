//! A sandbox provider as an [`AgentHost`]. Starting an agent finds the session's
//! sandbox or makes one, checks the repo out, and starts `claude` in tmux, all
//! on the session's own thread (`session`), so the UI gets a terminal at once
//! and watches the steps scroll by in it.

use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

pub use super::ready::{ready, Ready};
use super::{script, SandboxProvider};
use crate::execution::credential::ClaudeCredential;
use crate::execution::{AgentHost, Capabilities, HostError, LiveSession, SpawnSpec};
use crate::github::token::Token;
use crate::helpers::slugify;
use crate::repo_catalog::model::{RemoteRepo, SetupConfig};

/// How long a new sandbox may run. Vercel's Hobby plan stops a session at 45
/// minutes whatever is asked; keep-alive (`session`) extends paid plans.
pub const SANDBOX_TIMEOUT: Duration = Duration::from_secs(45 * 60);

/// The branch a sandbox session works on, like a local session's worktree:
/// `workspace/<slug>`. Its PRs are found by it (`github::links::repo_branch_prs`).
pub fn session_branch(workspace_id: &str) -> String {
    format!("workspace/{}", slugify(workspace_id))
}

/// Which sandbox, and what goes in it.
#[derive(Debug, Clone)]
pub struct SandboxTarget {
    pub workspace_id: String,
    /// The sandbox's name: `trace-<workspace id>`.
    pub sandbox: String,
    pub remote: RemoteRepo,
    pub title: String,
    /// The repo's worktree setup, run once after the clone (`setup`).
    pub setup: SetupConfig,
}

/// What an agent in a sandbox is logged in with. Only ever sent as env.
#[derive(Clone, Default)]
pub struct Secrets {
    /// Clones the repo, and lets the agent push and open PRs (`gh`).
    pub github: Option<Token>,
    /// When `github` is None: pick one of trace's GitHub accounts for the repo
    /// on the session's thread (`github::pick`, which may ask GitHub), trying
    /// these (login, why) first.
    pub pick_github: Option<Vec<(String, &'static str)>>,
    /// None: the user runs `/login` in the session.
    pub claude: Option<ClaudeCredential>,
}

pub struct SandboxHost<P: SandboxProvider> {
    provider: Arc<P>,
    target: SandboxTarget,
    secrets: Secrets,
}

impl<P: SandboxProvider> SandboxHost<P> {
    pub fn new(provider: P, target: SandboxTarget, secrets: Secrets) -> Self {
        Self {
            provider: Arc::new(provider),
            target,
            secrets,
        }
    }
}

/// What a sandbox gives besides the screen: the chat (with trace's tools over
/// its control channel), its hooks through the sandbox's event log (`events`),
/// and the Files tab read through the provider.
pub const CAPABILITIES: Capabilities = Capabilities {
    // Through the sandbox's event log (`events`).
    turn_hooks: true,
    transcript: false,
    // Read with git in the sandbox while it runs (`files`).
    files: true,
    terminal: false,
    tests: false,
    // The chat's, over its control channel (`agent_session::ToolsHost`).
    agent_tools: true,
    chat: true,
};

impl<P: SandboxProvider> AgentHost for SandboxHost<P> {
    fn capabilities(&self) -> Capabilities {
        CAPABILITIES
    }

    fn chat_opener(&self) -> Option<crate::agent_session::process::RemoteOpener> {
        Some(super::chat::opener(
            self.provider.clone(),
            self.target.clone(),
            self.secrets.clone(),
        ))
    }

    fn spawn(&self, app: &AppHandle, spec: SpawnSpec) -> Result<LiveSession, HostError> {
        if spec.cli != "claude" {
            return Err(HostError::Spawn(
                "Only Claude runs in a sandbox for now.".to_string(),
            ));
        }
        Ok(super::session::start(
            app.clone(),
            self.provider.clone(),
            self.target.clone(),
            self.secrets.clone(),
            spec,
        ))
    }
}

/// The labels a session's sandbox is found by, from any trace.
pub fn labels(target: &SandboxTarget) -> Vec<(String, String)> {
    vec![
        ("trace".to_string(), "session".to_string()),
        ("trace.ws".to_string(), target.workspace_id.clone()),
        ("trace.repo".to_string(), target.remote.full_name()),
        (
            "trace.title".to_string(),
            script::label_value(&target.title),
        ),
    ]
}

/// Get the sandbox ready and the agent running in it in tmux, for a terminal.
/// Returns the provider's session id and the repo folder to attach in.
pub fn prepare<P: SandboxProvider>(
    provider: &P,
    target: &SandboxTarget,
    secrets: &Secrets,
    spec: &SpawnSpec,
    say: &dyn Fn(&str),
) -> Result<(String, String), String> {
    let ready = ready(provider, target, secrets, &spec.env, say)?;
    if !ready.check(provider, script::tmux_alive_argv())? {
        // After a stop, pick the conversation up where it was left.
        // One Claude per conversation: a chat left running on it goes first.
        if !ready.fresh {
            super::chat::end_running(provider, &ready.session_id)?;
        }
        let continuing = !ready.fresh && ready.check(provider, script::has_conversation_argv())?;
        // A continued conversation gets the resume prompt, never the kickoff again.
        let prompt = if continuing {
            spec.resume_prompt.as_deref()
        } else {
            spec.prompt.as_deref()
        }
        .filter(|p| !p.trim().is_empty());
        say(if continuing {
            "Continuing the conversation…"
        } else {
            "Starting Claude…"
        });
        // Its hooks write to the sandbox's event log, which trace reads (`events`).
        let extra = super::helpers::with_hook_settings(spec.extra_args.clone());
        let agent = script::claude_argv(spec.model.as_deref(), &extra, prompt, continuing);
        let mut env = ready.agent_env(spec.env.clone());
        env.insert("TERM".to_string(), "xterm-256color".to_string());
        let argv = script::tmux_start_argv(&ready.dir, spec.cols, spec.rows, &agent);
        ready.run(provider, "Starting Claude", argv, &env)?;
    }
    Ok((ready.session_id, ready.dir))
}
