//! The sandbox's event log against a real sandbox (ignored by default):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_events -- --ignored --nocapture`.
//! With a Claude login saved in this trace, a real Claude in tmux ends a turn
//! and its Stop hook arrives through the log.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Arc;
use std::time::Duration;

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::execution::credential;
use crate::execution::sandbox::events::{self, OnHook};
use crate::execution::sandbox::host::{prepare, SandboxTarget, Secrets};
use crate::execution::sandbox::{prs, SandboxProvider};
use crate::execution::SpawnSpec;
use crate::repo_catalog::model::RemoteRepo;

fn sh(p: &Vercel, sid: &str, script: &str) -> String {
    let argv = vec!["bash".to_string(), "-c".to_string(), script.to_string()];
    let out = p.exec(sid, &argv, &HashMap::new()).expect("exec");
    assert!(out.ok(), "{script}: {}", out.stderr);
    out.stdout.trim().to_string()
}

fn collector() -> (OnHook, Receiver<String>) {
    let (tx, rx) = channel();
    let f: OnHook = Box::new(move |m| {
        let _ = tx.send(m.to_string());
    });
    (f, rx)
}

fn events_of(rx: &Receiver<String>, wait: Duration) -> Vec<String> {
    let mut out = Vec::new();
    while let Ok(m) = rx.recv_timeout(wait) {
        out.push(m.split(' ').next().unwrap_or("").to_string());
    }
    out
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_events_reach_trace() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!("events-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: events".into(),
        setup: Default::default(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let claude = credential::load();
    let spec = SpawnSpec {
        workspace_id: id.clone(),
        cwd: "/vercel/Hello-World".into(),
        cli: "claude".into(),
        resume_id: None,
        new_session_id: None,
        model: None,
        extra_args: Vec::new(),
        prompt: claude
            .is_some()
            .then(|| "Reply with just the word hi. Use no tools.".to_string()),
        resume_prompt: None,
        env: HashMap::new(),
        cols: 100,
        rows: 30,
    };
    let secrets = Secrets {
        claude: claude.clone(),
        ..Secrets::default()
    };
    let (sid, _) = prepare(&*provider, &target, &secrets, &spec, &|l| {
        println!("  say: {l}")
    })
    .expect("prepare");

    // The shim comes first on the PATH an agent gets.
    let gh = sh(&provider, &sid, "command -v gh");
    println!("gh is {gh}");
    assert!(gh.ends_with("/.local/bin/gh"));

    if claude.is_some() {
        // A real turn: Claude's Stop hook, through the log.
        let (on_hook, rx) = collector();
        let f = events::follow(provider.clone(), &sid, &id, Some(on_hook)).expect("follow");
        let mut got = Vec::new();
        for _ in 0..12 {
            got.extend(events_of(&rx, Duration::from_secs(10)));
            if got.iter().any(|e| e == "stop") {
                break;
            }
        }
        println!("from Claude: {got:?}");
        assert!(
            got.iter().any(|e| e == "stop"),
            "Claude's turn ended through the log"
        );
        drop(f);
    }

    // What happened while nobody was attached: only the newest turn, every PR.
    sh(
        &provider,
        &sid,
        r#"h="$HOME/.local/bin/trace-hook"
echo '{}' | "$h" prompt
printf '{"url":"https://github.com/octocat/Hello-World/pull/9"}' | "$h" pr
echo '{"notification_type":"permission_prompt"}' | "$h" needs-input"#,
    );
    let (on_hook, rx) = collector();
    let f = events::follow(provider.clone(), &sid, &id, Some(on_hook)).expect("follow");
    let backlog = events_of(&rx, Duration::from_secs(8));
    println!("backlog: {backlog:?}");
    assert_eq!(backlog, ["needs-input"]);
    assert_eq!(
        prs::of(&id),
        ["https://github.com/octocat/Hello-World/pull/9"]
    );

    // Live, as it happens.
    sh(
        &provider,
        &sid,
        r#"echo '{}' | "$HOME/.local/bin/trace-hook" stop"#,
    );
    assert_eq!(events_of(&rx, Duration::from_secs(8)), ["stop"]);
    drop(f);

    // Attaching again replays nothing already read.
    let (on_hook, rx) = collector();
    let f = events::follow(provider.clone(), &sid, &id, Some(on_hook)).expect("follow");
    assert!(
        events_of(&rx, Duration::from_secs(6)).is_empty(),
        "nothing replayed"
    );
    drop(f);

    prs::forget(&id);
    events::forget(&id);
}
