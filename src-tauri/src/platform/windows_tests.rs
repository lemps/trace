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

#[test]
fn restricting_a_dir_removes_everyone_else_and_reaches_new_files() {
    let dir = temp_dir("acl");
    restrict_acl(&dir).unwrap();
    let dir_acl = process::command("icacls").arg(&dir).output().unwrap();
    println!("{}", String::from_utf8_lossy(&dir_acl.stdout));
    let file = dir.join("token");
    Os::owner_only_options()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&file)
        .unwrap();
    let acl = process::command("icacls").arg(&file).output().unwrap();
    let acl = String::from_utf8_lossy(&acl.stdout).to_string();
    for other in [
        "Everyone",
        "BUILTIN\\Users",
        "Authenticated Users",
        "BUILTIN\\Administrators",
        "NT AUTHORITY\\SYSTEM",
    ] {
        assert!(!acl.contains(other), "{other} still has access: {acl}");
    }
    fs::write(&file, "readable by its owner").unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "readable by its owner");
    fs::remove_dir_all(&dir).unwrap();
}

/// The real relay, end to end: bash reaches a loopback listener through `/dev/tcp`.
#[test]
fn git_bash_can_run_the_hook_relay() {
    let dir = temp_dir("relay");
    let script = dir.join("relay");
    Os::install_script(
        &script,
        "#!/usr/bin/env bash\n\
         payload=\"$(base64 | tr -d '\\n')\"\n\
         exec 3<>\"/dev/tcp/127.0.0.1/$TRACE_RENDER_PORT\"\n\
         printf '%s\\n' \"$payload $1\" >&3\n\
         exec 3<&-\n",
    )
    .unwrap();
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = listener.local_addr().unwrap().port();

    let mut child = process::command(git_bash())
        .arg("-c")
        .arg(format!("'{}' stop", Os::shell_path(&script)))
        .env("TRACE_RENDER_PORT", port.to_string())
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
    assert_eq!(line.trim(), "aGk= stop");
    fs::remove_dir_all(&dir).unwrap();
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
