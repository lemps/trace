//! A sandbox looking after itself, against a real account (ignored by default):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_keepalive -- --ignored --nocapture`.
//! The keep-alive runs with short timings so the test takes a minute. (That
//! it sees Claude, `pgrep -x claude`, was tried on a real session too.)

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::execution::sandbox::host::SandboxTarget;
use crate::execution::sandbox::{egress, helpers, SandboxProvider, SandboxSpec};
use crate::repo_catalog::model::RemoteRepo;

fn sh(p: &Vercel, sid: &str, script: &str) -> String {
    let argv = vec!["bash".to_string(), "-c".to_string(), script.to_string()];
    let out = p.exec(sid, &argv, &HashMap::new()).expect("exec");
    format!("{}{}", out.stdout, out.stderr).trim().to_string()
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_keepalive_extends_while_working_and_stops_when_idle() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!("keep-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: keep-alive".into(),
        setup: Default::default(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    // Short, so Hobby's 45-minute ceiling leaves room to extend.
    let info = provider
        .create(&SandboxSpec {
            name: target.sandbox.clone(),
            labels: vec![("trace".into(), "live-test".into())],
            timeout: Duration::from_secs(10 * 60),
            ports: Vec::new(),
        })
        .expect("create");
    let sid = info.session_id.expect("session");
    let service = provider.self_service(&sid).expect("vercel can");
    let logins = egress::apply(
        &*provider,
        &target.sandbox,
        &sid,
        None,
        None,
        service.injections.clone(),
        &|l| println!("  say: {l}"),
    );
    assert!(logins.injected, "the policy took the scoped token");
    let install = provider
        .exec(&sid, &helpers::install_argv(), &HashMap::new())
        .expect("install");
    assert!(install.ok(), "{}", install.stderr);

    // The token reaches this session's extend, and nothing else of Vercel's.
    let scoped = sh(
        &provider,
        &sid,
        &format!(
            r#"curl -s -o /tmp/extend.json -w '%{{http_code}}' -X POST -H 'Authorization: Bearer x' -H 'Content-Type: application/json' -d '{{"duration":60000}}' '{}'; echo; curl -s -o /dev/null -w '%{{http_code}}' -H 'Authorization: Bearer x' https://api.vercel.com/v2/sandboxes"#,
            service.extend_url
        ),
    );
    println!("extend / list from inside: {scoped}");
    println!(
        "extend said: {}",
        sh(&provider, &sid, "cat /tmp/extend.json")
    );
    let codes: Vec<&str> = scoped.lines().collect();
    assert_eq!(codes.first(), Some(&"200"), "its own extend works");
    assert_ne!(codes.get(1), Some(&"200"), "nothing else gets the token");

    // Again, quickly: working (trace's heartbeat), then idle.
    sh(
        &provider,
        &sid,
        "mkdir -p ~/.trace && touch ~/.trace/attached",
    );
    let mut env = helpers::keepalive_env(&service, Default::default());
    env.extend([
        ("TRACE_KEEPALIVE_EVERY".to_string(), "5".to_string()),
        ("TRACE_EXTEND_EVERY".to_string(), "0".to_string()),
        ("TRACE_IDLE_SECS".to_string(), "20".to_string()),
    ]);
    provider
        .start_command(&sid, &helpers::keepalive_argv(), &env, "/vercel")
        .expect("keep-alive");
    std::thread::sleep(Duration::from_secs(12));
    let log = sh(&provider, &sid, "cat ~/.trace/keepalive.log");
    println!("while watched:\n{log}");
    assert!(
        log.contains("working: extend 200"),
        "it extends while working"
    );

    sh(&provider, &sid, "rm -f ~/.trace/attached");
    let until = Instant::now() + Duration::from_secs(120);
    let stopped = loop {
        let s = provider
            .find(&target.sandbox)
            .expect("find")
            .expect("there");
        if !s.is_running() {
            break s.status;
        }
        assert!(Instant::now() < until, "it stopped itself once idle");
        std::thread::sleep(Duration::from_secs(5));
    };
    println!("once idle: {stopped}");
}
