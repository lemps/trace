//! Run on real Windows by CI, including the assumptions a Mac can't check: that Git
//! Bash can carry the relay scripts, and that the ACL really shuts other users out.

use std::fs;
use std::io::Read;
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::Stdio;

use super::*;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("trace-{name}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

/// Git for Windows' bash, which Claude Code uses for hooks.
fn git_bash() -> PathBuf {
    env_dir("ProgramFiles", "Git\\bin\\bash.exe").expect("ProgramFiles is set")
}

#[test]
fn a_bare_name_never_matches_npms_unix_script() {
    assert_eq!(
        executable_forms("claude"),
        ["claude.exe", "claude.cmd", "claude.bat"]
    );
    assert_eq!(executable_forms("idea64.exe"), ["idea64.exe"]);
}

#[test]
fn batch_files_go_through_the_interpreter() {
    let wrapped = Os::pty_invocation(r"C:\npm\claude.CMD");
    assert_eq!(wrapped[1..], ["/c", r"C:\npm\claude.CMD"]);
    assert_eq!(
        Os::pty_invocation(r"C:\bin\claude.exe"),
        [r"C:\bin\claude.exe"]
    );
}

#[test]
fn path_always_ends_up_upper_case() {
    let vars = [("Path".to_string(), "x".to_string())];
    let env = with_upper_path(vars.into_iter());
    assert_eq!(env.get("PATH").map(String::as_str), Some("x"));
    assert!(!env.contains_key("Path"));
}

#[test]
fn liveness_tells_this_process_from_an_exited_one() {
    assert!(Os::is_alive(std::process::id()));
    let mut child = process::command("cmd")
        .args(["/c", "exit"])
        .spawn()
        .unwrap();
    let pid = child.id();
    child.wait().unwrap();
    drop(child);
    assert!(!Os::is_alive(pid));
}

#[test]
fn stopping_a_tree_ends_its_root() {
    let mut parent = process::command("cmd")
        .args(["/c", "ping -n 60 127.0.0.1 > NUL"])
        .stdin(Stdio::null())
        .spawn()
        .unwrap();
    let pid = parent.id();
    assert!(Os::is_alive(pid));
    Os::stop_tree(pid);
    parent.wait().unwrap();
    assert!(!Os::is_alive(pid));
}

#[test]
fn sids_parse_from_whoami_csv() {
    assert_eq!(
        parse_sid("\"host\\ron\",\"S-1-5-21-1-2-3-1001\"\r\n").as_deref(),
        Some("S-1-5-21-1-2-3-1001")
    );
    assert_eq!(parse_sid("not csv"), None);
}

fn acl_of(path: &std::path::Path) -> String {
    let out = process::command("icacls").arg(path).output().unwrap();
    String::from_utf8_lossy(&out.stdout).to_string()
}

const OTHER_USERS: [&str; 3] = ["Everyone", "BUILTIN\\Users", "Authenticated Users"];

#[test]
fn restricting_a_dir_shuts_out_other_users_and_reaches_new_files() {
    // The worst case: a parent that hands other users access, which the folder inherits.
    let parent = temp_dir("acl");
    icacls(
        &parent,
        &[
            "/grant".to_string(),
            "*S-1-5-32-545:(OI)(CI)R".to_string(),
            "*S-1-1-0:(OI)(CI)R".to_string(),
        ],
    )
    .unwrap();
    let dir = parent.join("trace");
    fs::create_dir(&dir).unwrap();
    let existing = dir.join("existing");
    fs::write(&existing, "written before").unwrap();
    let before = acl_of(&existing);
    assert!(before.contains("Everyone"), "test can't fail: {before}");

    restrict_acl(&dir).unwrap();

    let file = dir.join("token");
    Os::owner_only_options()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&file)
        .unwrap();
    for path in [&dir, &existing, &file] {
        let acl = acl_of(path);
        for other in OTHER_USERS {
            assert!(!acl.contains(other), "{other} still has access: {acl}");
        }
    }
    fs::write(&file, "readable by its owner").unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "readable by its owner");
    assert_eq!(fs::read_to_string(&existing).unwrap(), "written before");
    fs::remove_dir_all(&parent).unwrap();
}

/// The real relay, end to end: Git Bash runs `trace-hook`, which reaches a loopback
/// listener through `/dev/tcp`, as it does when Claude Code fires a hook.
#[test]
fn git_bash_can_run_the_real_hook_relay() {
    let dir = temp_dir("relay");
    let script = dir.join("trace-hook");
    Os::install_script(&script, crate::claude::hooks::HOOK_SCRIPT).unwrap();
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();

    let mut child = process::command(git_bash())
        .arg("-c")
        .arg(format!("'{}' stop", Os::shell_path(&script)))
        .env("TRACE_RENDER_PORT", port.to_string())
        .env("TRACE_RENDER_TOKEN", "token")
        .env("TRACE_ISSUE_KEY", "KEY-1")
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    {
        use std::io::Write;
        child.stdin.take().unwrap().write_all(b"hi").unwrap();
    }
    let (mut stream, _) = listener.accept().unwrap();
    let mut line = String::new();
    stream.read_to_string(&mut line).unwrap();
    assert!(child.wait().unwrap().success());
    assert_eq!(line.trim(), "token KEY-1 !stop aGk=");
    fs::remove_dir_all(&dir).unwrap();
}

fn open_pty() -> portable_pty::PtyPair {
    portable_pty::native_pty_system()
        .openpty(portable_pty::PtySize {
            rows: 24,
            cols: 200,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap()
}

/// A shim in npm's exact format, as `cmd-shim` writes it.
const NPM_SHIM: &str = "@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n\
:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST \"%dp0%\\node.exe\" (\r\n  \
SET \"_prog=%dp0%\\node.exe\"\r\n) ELSE (\r\n  SET \"_prog=node\"\r\n  \
SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || \
title %COMSPEC% & \"%_prog%\"  \"%dp0%\\node_modules\\pkg\\cli.js\" %*\r\n";

#[test]
fn npm_shims_name_their_program() {
    assert_eq!(
        npm_shim_target(NPM_SHIM).as_deref(),
        Some("node_modules\\pkg\\cli.js")
    );
    assert_eq!(npm_shim_target("@echo off\r\nsomething.exe %*\r\n"), None);
}

#[test]
fn a_shim_pointing_at_nothing_falls_back_to_the_interpreter() {
    let dir = temp_dir("shim");
    let tool = dir.join("tool.cmd");
    fs::write(&tool, NPM_SHIM).unwrap();
    let argv = Os::pty_invocation(&tool.to_string_lossy());
    assert_eq!(argv[1], "/c");
    fs::remove_dir_all(&dir).unwrap();
}

/// npm installs CLIs as `.cmd` files, and trace passes Claude its settings as JSON: quotes,
/// braces and all, from a home folder that can have spaces in its name.
#[test]
fn json_arguments_reach_a_program_installed_by_npm() {
    if process::command("node").arg("--version").output().is_err() {
        return; // Only CI is sure to have node; it's what npm's shims run.
    }
    let dir = temp_dir("first last");
    let out = dir.join("arg.txt");
    let tool = dir.join("tool.cmd");
    fs::write(&tool, NPM_SHIM).unwrap();
    let program = dir.join("node_modules\\pkg");
    fs::create_dir_all(&program).unwrap();
    fs::write(
        program.join("cli.js"),
        "require('fs').writeFileSync(process.env.ARG_OUT, process.argv[2])",
    )
    .unwrap();
    let json = r#"{"hooks":{"Stop":[{"command":"'C:/a b/trace-hook' stop & more"}]},"n":"100%"}"#;

    let pair = open_pty();
    let mut argv = Os::pty_invocation(&tool.to_string_lossy());
    argv.push(json.to_string());
    let mut cmd =
        portable_pty::CommandBuilder::from_argv(argv.into_iter().map(Into::into).collect());
    cmd.env("ARG_OUT", &out);
    cmd.env("PATH", std::env::var("PATH").unwrap());
    cmd.env(
        "PATHEXT",
        std::env::var("PATHEXT").unwrap_or_else(|_| ".EXE".to_string()),
    );
    cmd.cwd(&dir);
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    child.wait().unwrap();

    assert_eq!(fs::read_to_string(&out).unwrap(), json);
    drop(pair.master);
    fs::remove_dir_all(&dir).unwrap();
}

/// Why `pty_reports_exit` is false, and why closing the console is the cure: this is what
/// `claude::pty::watch_for_exit` depends on.
#[test]
fn a_pseudo_console_only_ends_its_reader_once_closed() {
    use std::sync::mpsc;
    use std::time::Duration;

    let pair = open_pty();
    let mut cmd = portable_pty::CommandBuilder::new("cmd.exe");
    cmd.args(["/c", "exit"]);
    let mut child = pair.slave.spawn_command(cmd).unwrap();
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().unwrap();
    let (eof_tx, eof_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        while matches!(reader.read(&mut buf), Ok(n) if n > 0) {}
        let _ = eof_tx.send(());
    });

    let pid = child.process_id().unwrap();
    child.wait().unwrap();
    assert!(!Os::is_alive(pid));
    assert!(
        eof_rx.recv_timeout(Duration::from_secs(2)).is_err(),
        "the reader ended by itself, so pty_reports_exit could be true"
    );
    drop(pair.master);
    eof_rx
        .recv_timeout(Duration::from_secs(10))
        .expect("closing the console should end the reader");
}

/// `commands::diff` shows untracked files this way.
#[test]
fn git_understands_dev_null_for_untracked_diffs() {
    let dir = temp_dir("diff");
    fs::write(dir.join("new.txt"), "hello\n").unwrap();
    let out = process::command("git")
        .args([
            "diff",
            "--no-color",
            "--no-index",
            "--",
            "/dev/null",
            "new.txt",
        ])
        .current_dir(&dir)
        .output()
        .unwrap();
    let diff = String::from_utf8_lossy(&out.stdout);
    assert!(diff.contains("+hello"), "unexpected diff: {diff}");
    fs::remove_dir_all(&dir).unwrap();
}
