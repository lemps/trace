//! Against a real Vercel account, so ignored by default. Run with
//! `cargo test --manifest-path src-tauri/Cargo.toml vercel_live -- --ignored --nocapture`,
//! with a token in `~/.config/trace-dev/vercel-token`. It makes one sandbox and
//! stops and deletes it at the end.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use super::{auth, Vercel};
use crate::execution::sandbox::host::{labels, prepare, SandboxTarget, Secrets};
use crate::execution::sandbox::{script, PtyRead, SandboxProvider};
use crate::execution::SpawnSpec;
use crate::repo_catalog::model::RemoteRepo;

fn token() -> Option<String> {
    let path = dirs::home_dir()?.join(".config/trace-dev/vercel-token");
    std::fs::read_to_string(path).ok()
}

fn visible(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut out = String::new();
    let mut in_escape = false;
    for c in text.chars() {
        match (in_escape, c) {
            (false, '\x1b') => in_escape = true,
            (true, c) if c.is_ascii_alphabetic() => in_escape = false,
            (true, _) => {}
            (false, c) if !c.is_control() => out.push(c),
            _ => out.push(' '),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_session_end_to_end() {
    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let conn = auth::connect(&token).expect("connect");
    println!("connected: {conn:?}");
    let provider = Vercel::new(conn);
    let id = format!("live-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let target = SandboxTarget {
        workspace_id: id.clone(),
        sandbox: format!("trace-{id}"),
        remote: RemoteRepo {
            host: "github.com".into(),
            owner: "octocat".into(),
            name: "Hello-World".into(),
        },
        title: "Live test: hello world!".into(),
    };
    let spec = SpawnSpec {
        workspace_id: id.clone(),
        cwd: "/vercel/Hello-World".into(),
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
    let started = Instant::now();
    let (session_id, dir) = prepare(&provider, &target, &Secrets::default(), &spec, &|l| {
        println!("  say: {l}");
    })
    .expect("prepare");
    println!("prepared in {:?}: dir {dir}", started.elapsed());

    let branch = provider
        .exec(
            &session_id,
            &[
                "git".into(),
                "-C".into(),
                dir.clone(),
                "branch".into(),
                "--show-current".into(),
            ],
            &HashMap::new(),
        )
        .expect("branch");
    println!("branch: {}", branch.stdout.trim());
    assert!(branch.stdout.trim().starts_with("workspace/live-"));

    let mut pty = provider
        .open_pty(&session_id, &script::tmux_attach_argv(), &dir, 100, 30)
        .expect("pty");
    let mut screen = Vec::new();
    let until = Instant::now() + Duration::from_secs(10);
    while Instant::now() < until {
        match pty.read() {
            PtyRead::Data(b) => screen.extend(b),
            PtyRead::Idle => {}
            other => panic!("pty ended early: {other:?}"),
        }
    }
    pty.send_resize(80, 24).expect("resize");
    let text = visible(&screen);
    println!(
        "screen ({} bytes): {}",
        screen.len(),
        text.chars().take(700).collect::<String>()
    );
    assert!(!screen.is_empty(), "the agent's screen came through");
    pty.close();

    let listed = provider.list("trace", "session").expect("list");
    let mine = listed
        .iter()
        .find(|s| s.name == target.sandbox)
        .expect("listed by tag");
    println!(
        "listed: {} {} labels {:?}",
        mine.name, mine.status, mine.labels
    );
    assert_eq!(mine.labels.get("trace.ws"), Some(&id));
    assert_eq!(labels(&target).len(), mine.labels.len());

    // Joining again finds it running and the agent still alive.
    let again = prepare(&provider, &target, &Secrets::default(), &spec, &|l| {
        println!("  say: {l}")
    })
    .expect("rejoin");
    assert_eq!(again.0, session_id);

    // Stop, then start again: the sandbox resumes from its snapshot, with the
    // work in its clone, and the agent comes back up.
    let marker = format!("{dir}/trace-live-marker");
    let none = HashMap::new();
    let wrote = provider
        .exec(
            &session_id,
            &["bash".into(), "-c".into(), format!("echo kept > {marker}")],
            &none,
        )
        .expect("write");
    assert!(wrote.ok());
    provider.stop(&session_id).expect("stop");
    for _ in 0..30 {
        let status = provider
            .find(&target.sandbox)
            .expect("find")
            .map(|s| s.status);
        if status.as_deref() == Some("stopped") {
            break;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    let said = std::sync::Mutex::new(Vec::<String>::new());
    let (resumed_id, _) = prepare(&provider, &target, &Secrets::default(), &spec, &|l| {
        println!("  say: {l}");
        if let Ok(mut s) = said.lock() {
            s.push(l.to_string());
        }
    })
    .expect("resume");
    assert_ne!(resumed_id, session_id, "a resume is a new session");
    assert!(said
        .lock()
        .expect("said")
        .iter()
        .any(|l| l.starts_with("Resuming")));
    let read = provider
        .exec(&resumed_id, &["cat".into(), marker.clone()], &none)
        .expect("read");
    assert_eq!(
        read.stdout.trim(),
        "kept",
        "the clone's work survived the stop"
    );
    let alive = provider
        .exec(&resumed_id, &script::tmux_alive_argv(), &none)
        .expect("tmux");
    assert!(alive.ok(), "the agent was started again");

    provider.stop(&resumed_id).expect("stop");
    for _ in 0..30 {
        if provider.remove(&target.sandbox).is_ok() {
            break;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    assert!(provider.find(&target.sandbox).expect("find").is_none());
}

/// Stops and deletes a test's sandbox however the test ends, so a failing run
/// doesn't leave one running on the account.
struct Cleanup {
    provider: std::sync::Arc<Vercel>,
    sandbox: String,
}

impl Drop for Cleanup {
    fn drop(&mut self) {
        for _ in 0..30 {
            match self.provider.find(&self.sandbox) {
                Ok(None) => return,
                Ok(Some(s)) if s.is_running() => {
                    if let Some(id) = s.session_id {
                        let _ = self.provider.stop(&id);
                    }
                }
                Ok(Some(_)) => {
                    if self.provider.remove(&self.sandbox).is_ok() {
                        return;
                    }
                }
                Err(_) => {}
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    }
}

/// Lines of a chat's stdout, read on a thread so a test can wait with a limit.
fn lines_of(stdout: Box<dyn std::io::Read + Send>) -> std::sync::mpsc::Receiver<String> {
    use std::io::{BufRead, BufReader};
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                return;
            }
        }
    });
    rx
}

/// Read until a turn's `result`, returning the bytes read.
fn until_result(lines: &std::sync::mpsc::Receiver<String>) -> u64 {
    let mut consumed = 0;
    loop {
        let line = lines
            .recv_timeout(Duration::from_secs(60))
            .expect("a line before the result");
        consumed += line.len() as u64 + 1;
        let v: serde_json::Value = serde_json::from_str(&line).unwrap_or_default();
        println!("  out: {}", line.chars().take(100).collect::<String>());
        if v["type"] == "result" {
            return consumed;
        }
    }
}

const SAY_HI: &str =
    r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"say hi"}]}}"#;

#[test]
#[ignore = "talks to a real Vercel account"]
fn vercel_live_chat_survives_a_disconnect() {
    use crate::agent_session::process::RemoteLaunch;

    let Some(token) = token() else {
        eprintln!("no token file; skipping");
        return;
    };
    let provider = std::sync::Arc::new(Vercel::new(auth::connect(&token).expect("connect")));
    let id = format!(
        "live-chat-{}",
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
        title: "Live chat test".into(),
    };
    let _cleanup = Cleanup {
        provider: provider.clone(),
        sandbox: target.sandbox.clone(),
    };
    let launch = || RemoteLaunch {
        workspace_id: id.clone(),
        args: [
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
        ]
        .map(String::from)
        .to_vec(),
        extra_args: Vec::new(),
        env: Vec::new(),
        initial_prompt: None,
        resume_prompt: None,
    };
    let open = || {
        crate::execution::sandbox::chat::opener(
            provider.clone(),
            target.clone(),
            Secrets::default(),
        )
    };

    // A first run, a turn, then let go of it.
    let mut first = open()(launch(), &|l| println!("  say: {l}")).expect("open");
    // Someone takes a while over their first message: past the HTTP client's
    // old 30 s limit, which once cut the output stream before it began.
    std::thread::sleep(Duration::from_secs(35));
    assert!(first.process.write_line(SAY_HI));
    let lines = lines_of(first.stdout);
    let consumed = until_result(&lines);
    assert!(
        first.process.detach(consumed),
        "a sandbox chat can be left running"
    );
    drop(lines);

    // Starting again rejoins the same Claude, past what was read.
    let said = std::sync::Mutex::new(Vec::<String>::new());
    let mut second = open()(launch(), &|l| {
        println!("  say: {l}");
        if let Ok(mut s) = said.lock() {
            s.push(l.to_string());
        }
    })
    .expect("rejoin");
    assert!(
        said.lock()
            .expect("said")
            .iter()
            .any(|l| l.starts_with("Rejoining")),
        "it rejoined rather than starting another Claude"
    );
    let lines = lines_of(second.stdout);
    assert!(
        lines.recv_timeout(Duration::from_secs(5)).is_err(),
        "nothing already read is replayed"
    );
    assert!(second.process.write_line(SAY_HI));
    until_result(&lines);

    // Stop & save: Claude ends and the sandbox is saved. Starting again
    // resumes the sandbox and picks the conversation up, as the terminal does.
    second.process.close_stdin();
    second.process.kill();
    for _ in 0..30 {
        let status = provider
            .find(&target.sandbox)
            .expect("find")
            .map(|s| s.status);
        if status.as_deref() == Some("stopped") {
            break;
        }
        std::thread::sleep(Duration::from_secs(2));
    }
    said.lock().expect("said").clear();
    let mut third = open()(launch(), &|l| {
        println!("  say: {l}");
        if let Ok(mut s) = said.lock() {
            s.push(l.to_string());
        }
    })
    .expect("resume");
    {
        let said = said.lock().expect("said");
        assert!(said.iter().any(|l| l.starts_with("Resuming")), "{said:?}");
        assert!(said.iter().any(|l| l.starts_with("Continuing")), "{said:?}");
    }
    let lines = lines_of(third.stdout);
    assert!(third.process.write_line(SAY_HI));
    until_result(&lines);
    third.process.close_stdin();
    third.process.kill();
    let _ = crate::claude::conversations::forget_session_id(&id);
}
