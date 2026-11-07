use super::*;

use std::sync::atomic::{AtomicBool, Ordering};

/// A shell line that takes about `secs` seconds, in this OS's shell.
fn sleep_line(secs: u32) -> String {
    if cfg!(windows) {
        format!("ping -n {} 127.0.0.1 > nul", secs + 1)
    } else {
        format!("sleep {secs}")
    }
}

/// A line that exits 0 if env var `key` is `value`, else 1.
fn env_is_line(key: &str, value: &str) -> String {
    if cfg!(windows) {
        format!("if \"%{key}%\"==\"{value}\" (exit 0) else (exit 1)")
    } else {
        format!("test \"${key}\" = {value}")
    }
}

/// A line that exits 0 if `file` exists in the working directory.
fn exists_line(file: &str) -> String {
    if cfg!(windows) {
        format!("if exist {file} (exit 0) else (exit 1)")
    } else {
        format!("test -f {file}")
    }
}

fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("trace-precheck-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn env() -> HashMap<String, String> {
    std::env::vars().collect()
}

fn check(line: &str, cwd: &Path, env: &HashMap<String, String>) -> PrecheckResult {
    run(line, cwd, env, Duration::from_secs(30), || false).unwrap()
}

#[test]
fn exit_zero_runs() {
    let dir = scratch("run");
    let result = check("exit 0", &dir, &env());
    assert_eq!(result.exit_code, Some(0));
    assert_eq!(result.verdict(), Verdict::Run);
}

#[test]
fn nonzero_exit_skips_and_keeps_the_reason() {
    let dir = scratch("skip");
    let result = check("echo no new failures && exit 3", &dir, &env());
    assert_eq!(result.exit_code, Some(3));
    assert_eq!(result.verdict(), Verdict::Skip);
    assert_eq!(result.output, "no new failures");
    assert!(!result.timed_out);
}

#[test]
fn runs_in_the_worktree_with_the_given_env() {
    let dir = scratch("cwd");
    std::fs::write(dir.join("marker.txt"), "x").unwrap();
    assert_eq!(
        check(&exists_line("marker.txt"), &dir, &env()).exit_code,
        Some(0)
    );
    let elsewhere = scratch("cwd-other");
    assert_eq!(
        check(&exists_line("marker.txt"), &elsewhere, &env()).exit_code,
        Some(1)
    );

    let mut vars = env();
    vars.insert("TRACE_PRECHECK_TEST".into(), "yes".into());
    assert_eq!(
        check(&env_is_line("TRACE_PRECHECK_TEST", "yes"), &dir, &vars).exit_code,
        Some(0)
    );
    vars.insert("TRACE_PRECHECK_TEST".into(), "no".into());
    assert_eq!(
        check(&env_is_line("TRACE_PRECHECK_TEST", "yes"), &dir, &vars).exit_code,
        Some(1)
    );
}

#[test]
fn a_precheck_past_its_timeout_is_killed_and_fails_the_run() {
    let dir = scratch("timeout");
    let started = Instant::now();
    let result = run(
        &sleep_line(30),
        &dir,
        &env(),
        Duration::from_millis(500),
        || false,
    )
    .unwrap();
    assert!(
        started.elapsed() < Duration::from_secs(10),
        "took {:?}",
        started.elapsed()
    );
    assert!(result.timed_out);
    assert_eq!(result.exit_code, None);
    assert!(matches!(result.verdict(), Verdict::Fail(_)));
}

#[test]
fn cancelling_stops_it_early() {
    let dir = scratch("cancel");
    let stop = AtomicBool::new(false);
    let started = Instant::now();
    let result = run(
        &sleep_line(30),
        &dir,
        &env(),
        Duration::from_secs(60),
        || {
            let cancel = started.elapsed() > Duration::from_millis(300);
            stop.store(cancel, Ordering::SeqCst);
            cancel
        },
    )
    .unwrap();
    assert!(stop.load(Ordering::SeqCst));
    assert!(started.elapsed() < Duration::from_secs(10));
    assert!(!result.timed_out);
    assert!(matches!(result.verdict(), Verdict::Fail(_)));
}

#[test]
fn normalize_trims_drops_blank_and_refuses_multiple_lines() {
    assert_eq!(normalize(None), Ok(None));
    assert_eq!(normalize(Some("   ".into())), Ok(None));
    assert_eq!(
        normalize(Some("  gh run list  ".into())),
        Ok(Some("gh run list".into()))
    );
    assert!(normalize(Some("a\nb".into())).is_err());
    assert!(normalize(Some("x".repeat(MAX_LEN + 1))).is_err());
}

#[test]
fn old_runs_without_a_precheck_still_parse() {
    let r: PrecheckResult = serde_json::from_str(r#"{"command":"true"}"#).unwrap();
    assert_eq!(r.exit_code, None);
    assert_eq!(r.output, "");
}

#[test]
fn output_keeps_the_tail() {
    assert_eq!(describe(TIMEOUT), "2 minutes");
    let long = "x".repeat(OUTPUT_TAIL * 10) + "the end";
    let kept = read_tail(&mut long.as_bytes());
    assert!(kept.len() <= OUTPUT_TAIL * 4);
    assert!(kept.ends_with(b"the end"));
}

#[test]
fn a_background_child_is_stopped_when_the_line_exits() {
    let dir = scratch("background");
    // The child inherits the output pipes; left running, it would hold them
    // open and the reason would be lost.
    let line = if cfg!(windows) {
        "start /b ping -n 30 127.0.0.1 & echo nothing new & exit 1".to_string()
    } else {
        "sleep 30 & echo nothing new; exit 1".to_string()
    };
    let started = Instant::now();
    let result = check(&line, &dir, &env());
    assert_eq!(result.exit_code, Some(1));
    assert!(
        result.output.contains("nothing new"),
        "output: {:?}",
        result.output
    );
    assert!(started.elapsed() < DRAIN, "took {:?}", started.elapsed());
}
