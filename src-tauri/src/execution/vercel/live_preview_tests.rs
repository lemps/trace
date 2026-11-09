//! Preview URLs against a real sandbox (ignored by default):
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live_preview -- --ignored --nocapture`.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::live_tests::{token, Cleanup};
use super::{auth, Vercel};
use crate::execution::sandbox::host::{ready, SandboxTarget, Secrets};
use crate::execution::sandbox::{SandboxProvider, PREVIEW_PORTS};
use crate::repo_catalog::model::RemoteRepo;

fn serve(p: &Vercel, sid: &str, port: u16, host: &str) {
    let js = format!(
        "require('http').createServer((q,s)=>s.end('hello-{port}')).listen({port},'{host}')"
    );
    let argv = vec!["node".to_string(), "-e".to_string(), js];
    p.start_command(sid, &argv, &HashMap::new(), "/vercel")
        .expect("serve");
}

/// The body at `url`, retried while the server starts.
fn fetch(url: &str) -> String {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("client");
    let until = Instant::now() + Duration::from_secs(30);
    loop {
        let got = client.get(url).send().and_then(|r| {
            let status = r.status();
            r.text().map(|t| format!("{status} {t}"))
        });
        match got {
            Ok(t) if t.starts_with("200") || Instant::now() > until => return t,
            Err(e) if Instant::now() > until => return format!("error: {e}"),
            _ => std::thread::sleep(Duration::from_secs(2)),
        }
    }
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_preview_reaches_a_dev_server() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!(
        "preview-{}",
        &uuid::Uuid::new_v4().simple().to_string()[..8]
    );
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: previews".into(),
        setup: Default::default(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let r = ready(
        &*provider,
        &target,
        &Secrets::default(),
        &HashMap::new(),
        &|_| {},
    )
    .expect("ready");
    let found = provider
        .find(&target.sandbox)
        .expect("find")
        .expect("there");
    println!("previews: {:?}", found.previews);
    let ports: Vec<u16> = found.previews.iter().map(|p| p.port).collect();
    assert_eq!(ports, PREVIEW_PORTS);

    serve(&provider, &r.session_id, 3000, "0.0.0.0");
    serve(&provider, &r.session_id, 5173, "127.0.0.1");
    let url = |port| {
        found
            .previews
            .iter()
            .find(|p| p.port == port)
            .map(|p| p.url.clone())
            .expect("route")
    };
    let open = fetch(&url(3000));
    println!(":3000 (all interfaces) -> {open}");
    assert!(open.contains("hello-3000"));
    let local = fetch(&url(5173));
    println!(":5173 (127.0.0.1 only) -> {local}");

    // A port added to a running sandbox gets a route too.
    let more = provider
        .set_ports(&target.sandbox, &[3000, 5173, 8080, 4000])
        .expect("set ports");
    println!("after adding 4000: {more:?}");
    assert!(more.iter().any(|p| p.port == 4000));
}
