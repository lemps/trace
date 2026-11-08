//! A sandbox provider as an [`AgentHost`]. Starting an agent finds the session's
//! sandbox or makes one, checks the repo out, and starts `claude` in tmux, all
//! on the session's own thread (`session`), so the UI gets a terminal at once
//! and watches the steps scroll by in it.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

use super::{acquire, script, SandboxProvider};
use crate::execution::credential::ClaudeCredential;
use crate::execution::{AgentHost, Capabilities, HostError, LiveSession, SpawnSpec};
use crate::github::token::{redact, Token};
use crate::helpers::slugify;
use crate::repo_catalog::model::RemoteRepo;

/// How long a new sandbox may run. Vercel's Hobby plan stops a session at 45
/// minutes whatever is asked; keep-alive (`session`) extends paid plans.
pub const SANDBOX_TIMEOUT: Duration = Duration::from_secs(45 * 60);

/// Which sandbox, and what goes in it.
#[derive(Debug, Clone)]
pub struct SandboxTarget {
    pub workspace_id: String,
    /// The sandbox's name: `trace-<workspace id>`.
    pub sandbox: String,
    pub remote: RemoteRepo,
    pub title: String,
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

/// What a sandbox gives besides the screen: the chat. Its hooks and tools can't
/// reach trace, and its files aren't on this machine.
pub const CAPABILITIES: Capabilities = Capabilities {
    turn_hooks: false,
    transcript: false,
    files: false,
    terminal: false,
    tests: false,
    agent_tools: false,
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

/// A sandbox ready for an agent: running, its repo checked out, Claude set up.
pub struct Ready {
    /// The provider's id for this run of the sandbox.
    pub session_id: String,
    /// The repo's folder in it.
    pub dir: String,
    /// Made just now, so nothing has run in it yet.
    pub fresh: bool,
    /// What an agent in it is logged in with: Claude, and GitHub for `gh` and
    /// pushes. Only ever passed as env.
    pub env: HashMap<String, String>,
    github: Option<Token>,
}

impl Ready {
    /// Run a setup step, failing with its stderr (any token redacted).
    pub fn run<P: SandboxProvider>(
        &self,
        provider: &P,
        step: &str,
        argv: Vec<String>,
        env: &HashMap<String, String>,
    ) -> Result<(), String> {
        let out = provider.exec(&self.session_id, &argv, env)?;
        if out.ok() {
            return Ok(());
        }
        let why = crate::helpers::tail_chars(out.stderr.trim(), 400);
        Err(redact(
            &format!("{step} failed: {why}"),
            self.github.as_ref(),
        ))
    }

    /// Whether a quick check in the sandbox passes.
    pub fn check<P: SandboxProvider>(
        &self,
        provider: &P,
        argv: Vec<String>,
    ) -> Result<bool, String> {
        Ok(provider
            .exec(&self.session_id, &argv, &HashMap::new())?
            .ok())
    }
}

/// Get the session's sandbox running with its repo checked out and Claude set
/// up, whichever way the agent will run in it (terminal or chat). `say`
/// reports each step.
pub fn ready<P: SandboxProvider>(
    provider: &P,
    target: &SandboxTarget,
    secrets: &Secrets,
    say: &dyn Fn(&str),
) -> Result<Ready, String> {
    let github = match (&secrets.github, &secrets.pick_github) {
        (Some(token), _) => Some(token.clone()),
        (None, Some(prefer)) => crate::github::pick::for_repo(&target.remote, prefer).map(|c| {
            say(&format!("GitHub account: {} ({}).", c.login, c.why));
            c.token
        }),
        (None, None) => None,
    };
    let (session_id, how) = acquire::sandbox_session(provider, target, say)?;
    let gh_env: HashMap<String, String> = github
        .iter()
        .map(|t| ("GH_TOKEN".to_string(), t.expose().to_string()))
        .collect();
    let mut env: HashMap<String, String> = secrets
        .claude
        .iter()
        .flat_map(ClaudeCredential::env)
        .collect();
    env.extend(gh_env.clone());
    let mut ready = Ready {
        session_id,
        dir: script::repo_dir(provider.home(), &target.remote),
        fresh: how == acquire::Got::Created,
        env,
        github,
    };
    // A first start that failed partway (a clone refused, say) left the setup
    // unfinished: clear what it made and do it again, rather than run Claude in
    // a half-made checkout.
    if !ready.fresh && !ready.check(provider, script::setup_done_argv(&ready.dir))? {
        say("Its setup didn't finish last time, so doing it again…");
        let clear = vec!["rm".to_string(), "-rf".to_string(), ready.dir.clone()];
        ready.run(
            provider,
            "Clearing the half-made checkout",
            clear,
            &HashMap::new(),
        )?;
        ready.fresh = true;
    }
    if ready.fresh {
        let (dir, none) = (&ready.dir, HashMap::new());
        say(&format!("Cloning {}…", target.remote.full_name()));
        let clone_env = script::clone_env(ready.github.as_ref());
        ready.run(
            provider,
            "Cloning",
            script::clone_argv(&target.remote, dir),
            &clone_env,
        )?;
        let branch = format!("workspace/{}", slugify(&target.workspace_id));
        ready.run(
            provider,
            "Checking out the session's branch",
            script::branch_argv(dir, &branch),
            &none,
        )?;
        ready.run(
            provider,
            "Setting up tmux",
            script::write_home_file_argv(".tmux.conf", script::TMUX_CONF),
            &none,
        )?;
        let suffix = secrets
            .claude
            .as_ref()
            .and_then(ClaudeCredential::approved_key_suffix);
        let claude_json = script::claude_json(dir, suffix.as_deref());
        ready.run(
            provider,
            "Setting up Claude",
            script::write_home_file_argv(".claude.json", &claude_json),
            &none,
        )?;
        if !gh_env.is_empty() {
            // Best-effort: without it the agent can still work, just not push.
            let _ = provider.exec(&ready.session_id, &script::git_identity_argv(), &gh_env);
        }
        ready.run(
            provider,
            "Finishing setup",
            script::write_home_file_argv(script::SETUP_MARKER, "1"),
            &none,
        )?;
    }
    Ok(ready)
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
    let ready = ready(provider, target, secrets, say)?;
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
        let agent =
            script::claude_argv(spec.model.as_deref(), &spec.extra_args, prompt, continuing);
        let mut env = spec.env.clone();
        env.extend(ready.env.clone());
        env.insert("TERM".to_string(), "xterm-256color".to_string());
        let argv = script::tmux_start_argv(&ready.dir, spec.cols, spec.rows, &agent);
        ready.run(provider, "Starting Claude", argv, &env)?;
    }
    Ok((ready.session_id, ready.dir))
}
