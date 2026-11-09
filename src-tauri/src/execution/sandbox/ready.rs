//! Getting a session's sandbox ready for an agent, whichever way it runs
//! (terminal or chat): running, logged in through its network (`egress`),
//! trace's helpers installed, and on a first start the repo cloned, its branch
//! checked out, Claude set up and the repo's own setup run.

use std::collections::HashMap;

use super::host::{session_branch, SandboxTarget, Secrets};
use super::{acquire, egress, script, SandboxProvider};
use crate::execution::credential::ClaudeCredential;
use crate::github::token::{redact, Token};

/// A sandbox ready for an agent: running, its repo checked out, Claude set up.
pub struct Ready {
    /// The provider's id for this run of the sandbox.
    pub session_id: String,
    /// The repo's folder in it.
    pub dir: String,
    /// Made just now, so nothing has run in it yet.
    pub fresh: bool,
    /// What an agent in it is logged in with: placeholders when the sandbox's
    /// network adds the real Claude and GitHub logins (`egress`), else the
    /// secrets themselves. Only ever passed as env.
    pub env: HashMap<String, String>,
    /// The network carries the logins, so the VM holds only placeholders.
    pub injected: bool,
    /// `--mcp-config` for the agent: the MCP servers trace is logged in to, by
    /// URL alone (`mcp_auth`). None when there are none, or no network logins.
    pub mcp_config: Option<String>,
    /// What the network policy was made from, to make it again (`watch`).
    pub sources: Sources,
    github: Option<Token>,
}

impl Ready {
    /// The agent's whole env: its launch env (model, provider endpoint) and
    /// the logins, with no secret in it when the network carries them.
    pub fn agent_env(&self, launch: HashMap<String, String>) -> HashMap<String, String> {
        let mut env = match self.injected {
            true => egress::without_endpoint_key(launch),
            false => launch,
        };
        env.extend(self.env.clone());
        env
    }

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

/// What a sandbox's network policy is made from, besides the MCP logins and
/// the provider's own (each read fresh when it's made).
#[derive(Clone, Default)]
pub struct Sources {
    pub github: Option<Token>,
    pub claude: Option<ClaudeCredential>,
    pub endpoint: Option<egress::Injection>,
}

/// The whole policy for `session_id`, made now: logins, the provider's own,
/// and the MCP servers' tokens (refreshed if they're close to expiring).
pub fn policy<P: SandboxProvider + ?Sized>(
    provider: &P,
    session_id: &str,
    sources: &Sources,
) -> egress::Egress {
    let mut e = egress::for_secrets(sources.github.as_ref(), sources.claude.as_ref());
    e.injections.extend(sources.endpoint.clone());
    e.injections.extend(
        provider
            .self_service(session_id)
            .into_iter()
            .flat_map(|s| s.injections),
    );
    e.injections
        .extend(crate::mcp_auth::for_sandbox().injections);
    e
}

/// Get the session's sandbox running with its repo checked out and Claude set
/// up, whichever way the agent will run in it (terminal or chat). `say`
/// reports each step.
pub fn ready<P: SandboxProvider>(
    provider: &P,
    target: &SandboxTarget,
    secrets: &Secrets,
    launch_env: &HashMap<String, String>,
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
    // The network also lets the sandbox extend and stop itself (`keep_alive`).
    let service = provider.self_service(&session_id);
    let mut extra: Vec<egress::Injection> = egress::endpoint(launch_env).into_iter().collect();
    extra.extend(service.iter().flat_map(|s| s.injections.clone()));
    // The team's MCP servers trace is logged in to, each token for its server.
    let mcp = crate::mcp_auth::for_sandbox();
    extra.extend(mcp.injections.clone());
    let sources = Sources {
        github: github.clone(),
        claude: secrets.claude.clone(),
        endpoint: egress::endpoint(launch_env),
    };
    let logins = egress::apply(
        provider,
        &target.sandbox,
        &session_id,
        github.as_ref(),
        secrets.claude.as_ref(),
        extra,
        say,
    );
    let gh_env: HashMap<String, String> = logins
        .env
        .iter()
        .filter(|(k, _)| k.as_str() == "GH_TOKEN")
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let mut ready = Ready {
        session_id,
        dir: script::repo_dir(provider.home(), &target.remote),
        fresh: how == acquire::Got::Created,
        env: logins.env,
        injected: logins.injected,
        // Without the network carrying their tokens, they'd only refuse.
        mcp_config: mcp.config.filter(|_| logins.injected),
        sources,
        github,
    };
    if !mcp.left_out.is_empty() {
        say(&format!(
            "Not adding {}: the login expired. Connect again in Integrations → MCP servers.",
            mcp.left_out.join(", ")
        ));
    }
    // On every start, so a sandbox an older trace made gets the current ones.
    ready.run(
        provider,
        "Installing trace's helpers",
        super::helpers::install_argv(),
        &HashMap::new(),
    )?;
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
        // With the token in the network policy, the clone needs none of its own.
        let clone_token = ready.github.as_ref().filter(|_| !logins.injected);
        let clone_env = script::clone_env(clone_token);
        ready.run(
            provider,
            "Cloning",
            script::clone_argv(&target.remote, dir),
            &clone_env,
        )?;
        let branch = session_branch(&target.workspace_id);
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
        // The key Claude Code sees is the placeholder when the network adds the real one.
        let seen_key = secrets.claude.as_ref().map(|c| match logins.injected {
            true => ClaudeCredential::new(c.kind, egress::API_KEY_PLACEHOLDER),
            false => Some(c.clone()),
        });
        let suffix = seen_key
            .flatten()
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
        super::setup::run(provider, &ready, &target.setup, say)?;
        ready.run(
            provider,
            "Finishing setup",
            script::write_home_file_argv(script::SETUP_MARKER, "1"),
            &none,
        )?;
    }
    if let (true, Some(service)) = (logins.injected, &service) {
        keep_alive(provider, &ready, service);
    }
    if logins.injected {
        // Its MCP tokens expire within the hour: renew them while trace is open.
        super::watch::watch(
            provider.shared(),
            &target.sandbox,
            &ready.session_id,
            ready.sources.clone(),
        );
    }
    Ok(ready)
}

/// Start the sandbox's keep-alive (`helpers`), which keeps it running while
/// its agent works and stops (saves) it once idle, whether or not trace is
/// attached. Only when the network can carry its token. Best-effort.
fn keep_alive<P: SandboxProvider>(provider: &P, ready: &Ready, service: &super::SelfService) {
    let _ = provider.start_command(
        &ready.session_id,
        &super::helpers::keepalive_argv(),
        &super::helpers::keepalive_env(service, super::lifetime::load()),
        provider.home(),
    );
}
