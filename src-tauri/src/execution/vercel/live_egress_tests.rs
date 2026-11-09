//! Credential injection against a real Vercel account (ignored by default):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_egress -- --ignored --nocapture`.
//! Uses the Vercel token in `~/.config/trace-dev/vercel-token` and, when this
//! machine's trace has them, its GitHub account and Claude login, which go
//! only into the sandbox's network policy. Nothing is pushed: write access is
//! proved with `git push --dry-run`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::execution::credential;
use crate::execution::sandbox::egress::{self, Injection};
use crate::execution::sandbox::{SandboxProvider, SandboxSpec};
use crate::repo_catalog::model::RemoteRepo;

fn sh(provider: &Vercel, sid: &str, script: &str, env: &HashMap<String, String>) -> (bool, String) {
    let argv = vec!["bash".to_string(), "-c".to_string(), script.to_string()];
    let out = provider.exec(sid, &argv, env).expect("exec");
    let text = format!("{}{}", out.stdout, out.stderr);
    (out.ok(), text.trim().to_string())
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_egress_injects_credentials() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let name = format!(
        "trace-egress-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: name.clone(),
    };
    let info = provider
        .create(&SandboxSpec {
            name: name.clone(),
            labels: vec![("trace".into(), "live-test".into())],
            timeout: Duration::from_secs(15 * 60),
            ports: Vec::new(),
        })
        .expect("create");
    let sid = info.session_id.expect("session");

    let trace_repo = RemoteRepo {
        host: "github.com".into(),
        owner: "noble1911".into(),
        name: "trace".into(),
    };
    let github = crate::github::pick::for_repo(&trace_repo, &[]);
    let claude = credential::load();
    println!(
        "github: {:?}, claude: {:?}",
        github.as_ref().map(|c| &c.login),
        claude.as_ref().map(|c| c.kind)
    );
    let mut egress = egress::for_secrets(github.as_ref().map(|c| &c.token), claude.as_ref());
    egress.injections.push(Injection {
        domain: "httpbin.org".into(),
        headers: vec![
            ("Authorization".into(), "Bearer from-outside".into()),
            ("X-Trace-Probe".into(), "probe-123".into()),
        ],
        ..Injection::default()
    });
    println!("policy: {egress:?}");
    let started = Instant::now();
    provider
        .set_egress(&name, &sid, &egress)
        .expect("set egress");
    println!("set in {:?}", started.elapsed());

    let none = HashMap::new();
    let probe = r#"curl -sS https://httpbin.org/headers -H 'Authorization: Bearer inside'"#;
    let (ok, seen) = sh(&provider, &sid, probe, &none);
    println!("httpbin: {seen}");
    assert!(ok, "curl ran");
    assert!(seen.contains("probe-123"), "the probe header was added");
    assert!(
        seen.contains("Bearer from-outside"),
        "injected Authorization"
    );
    assert!(
        !seen.contains("Bearer inside"),
        "the sandbox's own was replaced"
    );

    let env = egress::placeholder_env(github.is_some(), claude.as_ref().map(|c| c.kind));
    let (_, environ) = sh(
        &provider,
        &sid,
        "env; cat /proc/*/environ 2>/dev/null | tr '\\0' '\\n'",
        &env,
    );
    for secret in egress.injections.iter().flat_map(|i| &i.headers) {
        if secret.1.contains("from-outside") || secret.1 == "probe-123" {
            continue;
        }
        let bare = secret
            .1
            .trim_start_matches("Bearer ")
            .trim_start_matches("Basic ");
        assert!(
            !environ.contains(bare),
            "a real secret is in the sandbox's env"
        );
    }

    if let Some(gh) = &github {
        let (ok, login) = sh(&provider, &sid, "gh api user --jq .login", &env);
        println!("gh api user: {login}");
        assert!(
            ok && login.eq_ignore_ascii_case(&gh.login),
            "gh is logged in"
        );
        let git = r#"set -e
export GIT_TERMINAL_PROMPT=0
git clone -q --depth 1 https://github.com/noble1911/trace.git /tmp/probe
cd /tmp/probe
git push --dry-run origin HEAD:refs/heads/trace-egress-probe 2>&1"#;
        let (ok, out) = sh(&provider, &sid, git, &env);
        println!("git clone + push --dry-run: ok={ok} {out}");
        assert!(ok, "git can clone and push");
    }

    if claude.is_some() {
        let ask = r#"cd /tmp && timeout 120 claude -p 'Reply with exactly the word pong and nothing else.' 2>&1 | tail -c 600"#;
        let (ok, said) = sh(&provider, &sid, ask, &env);
        println!("claude -p: ok={ok} {said}");
        assert!(said.to_lowercase().contains("pong"), "Claude answered");
    }

    // Does a resumed session keep the policy? Stop (snapshots), then resume.
    provider.stop(&sid).expect("stop");
    let until = Instant::now() + Duration::from_secs(180);
    loop {
        let s = provider.find(&name).expect("find").expect("still there");
        if s.status == "stopped" {
            break;
        }
        assert!(Instant::now() < until, "stopped in time (was {})", s.status);
        std::thread::sleep(Duration::from_secs(3));
    }
    let resumed = provider.resume(&name).expect("resume");
    let sid2 = resumed.session_id.expect("new session");
    let (_, seen) = sh(&provider, &sid2, probe, &none);
    println!("after resume: {seen}");
    let kept = seen.contains("probe-123");
    println!("policy survives a resume: {kept}");
    assert!(kept, "the sandbox kept its policy across a stop");
}

/// The real start path with real logins: a private repo clones with no token
/// in the clone's env, `gh` and git work in the agent's env, Claude starts in
/// tmux, and no secret is anywhere in the VM.
#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_egress_session_has_no_secrets() {
    use crate::execution::sandbox::host::{prepare, SandboxTarget, Secrets};
    use crate::execution::SpawnSpec;

    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!("egress-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let remote = RemoteRepo {
        host: "github.com".into(),
        owner: "noble1911".into(),
        name: "trace".into(),
    };
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: remote.clone(),
        title: "Live test: no secrets in the VM".into(),
        // Setup gets the injected login and a login shell's PATH; copied files stay here.
        setup: crate::repo_catalog::model::SetupConfig {
            copy_files: vec![".env".into()],
            commands: vec![
                "gh api user --jq .login > .setup-login".into(),
                "node --version > .setup-node".into(),
            ],
        },
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let Some(github) = crate::github::pick::for_repo(&remote, &[]) else {
        eprintln!("no GitHub account; skipping");
        return;
    };
    let claude = credential::load();
    let secrets = Secrets {
        github: Some(github.token.clone()),
        pick_github: None,
        claude: claude.clone(),
    };
    let spec = SpawnSpec {
        workspace_id: id.clone(),
        cwd: "/vercel/trace".into(),
        cli: "claude".into(),
        resume_id: None,
        new_session_id: None,
        model: None,
        extra_args: Vec::new(),
        prompt: None,
        resume_prompt: None,
        env: HashMap::new(),
        cols: 100,
        rows: 30,
    };
    let said = std::sync::Mutex::new(Vec::<String>::new());
    let (sid, dir) = prepare(&*provider, &target, &secrets, &spec, &|l| {
        println!("  say: {l}");
        said.lock().expect("lock").push(l.to_string());
    })
    .expect("prepare");
    assert!(
        !said
            .lock()
            .expect("lock")
            .iter()
            .any(|l| l.contains("environment")),
        "no fallback to env"
    );
    assert!(
        sh(
            &provider,
            &sid,
            "tmux has-session -t trace",
            &HashMap::new()
        )
        .0
    );

    let (_, everything) = sh(
        &provider,
        &sid,
        "cat /proc/*/environ 2>/dev/null | tr '\\0' '\\n'; cat ~/.gitconfig ~/.claude.json ~/.config/gh/hosts.yml 2>/dev/null",
        &HashMap::new(),
    );
    assert!(
        everything.contains(egress::GITHUB_PLACEHOLDER),
        "the agent's env has the placeholder"
    );
    assert!(
        !everything.contains(github.token.expose()),
        "no GitHub token in the VM"
    );
    if let Some(c) = &claude {
        assert!(
            !everything.contains(c.secret()),
            "no Claude login in the VM"
        );
    }

    assert!(
        said.lock()
            .expect("lock")
            .iter()
            .any(|l| l.contains("Not copying .env")),
        "copied files are left on this machine"
    );
    let (ok, ran) = sh(
        &provider,
        &sid,
        &format!("cat {dir}/.setup-login {dir}/.setup-node"),
        &HashMap::new(),
    );
    println!("setup wrote: {ran}");
    assert!(
        ok && ran.to_lowercase().contains(&github.login.to_lowercase()),
        "setup ran logged in"
    );

    let agent_env = egress::placeholder_env(true, claude.as_ref().map(|c| c.kind));
    let push = format!(
        "cd {dir} && git config user.email && git push --dry-run origin HEAD 2>&1 && gh pr list --limit 1 --json number --jq length"
    );
    let (ok, out) = sh(&provider, &sid, &push, &agent_env);
    println!("identity + push --dry-run + gh: ok={ok} {out}");
    assert!(ok, "the agent can push and use gh");
}

/// Whether a sandbox's Claude, logged in by the network, sees the account's
/// claude.ai connectors (prints what `claude mcp list` says; asserts nothing).
#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_egress_probe_connectors() {
    let (Some(token), Some(claude)) = (token(), credential::load()) else {
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let name = format!(
        "trace-probe-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: name.clone(),
    };
    let info = provider
        .create(&SandboxSpec {
            name: name.clone(),
            labels: vec![("trace".into(), "live-test".into())],
            timeout: Duration::from_secs(10 * 60),
            ports: Vec::new(),
        })
        .expect("create");
    let sid = info.session_id.expect("session");
    let logins = egress::apply(
        &*provider,
        &name,
        &sid,
        None,
        Some(&claude),
        Vec::new(),
        &|l| println!("{l}"),
    );
    let (_, out) = sh(
        &provider,
        &sid,
        "cd /tmp && claude mcp list 2>&1 | head -30",
        &logins.env,
    );
    println!("claude mcp list in the sandbox:\n{out}");
}
