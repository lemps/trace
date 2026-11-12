//! The setup list's Sign in button: run the CLI's own browser login in the
//! background, so nobody needs a terminal. `claude auth login` opens the browser
//! itself and finishes through a localhost callback. `gh auth login --web`, with
//! no terminal attached, prints a one-time code and a URL instead; we hand those
//! to the renderer, which shows the code and opens the page. Either way the
//! process then waits for the browser, and the renderer re-checks until the
//! check passes. Nothing here reads or stores a token: each CLI keeps its own.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;

use crate::claude::discovery::find_cli_with_env;
use crate::claude::env::build_effective_cli_env;
use crate::platform::install_hints::Tool;

/// How long a login may wait for the browser before it's stopped.
const LOGIN_LIMIT: Duration = Duration::from_secs(600);

/// How long `gh` gets to print its one-time code.
const CODE_LIMIT: Duration = Duration::from_secs(20);

const POLL: Duration = Duration::from_millis(200);

/// What the renderer needs to finish a login: for `gh`, the code to type and the
/// page to type it on. Claude Code opens its own page, so both are None.
#[derive(Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignInStart {
    pub code: Option<String>,
    pub url: Option<String>,
}

/// One cancel flag per tool with a login running. Starting again cancels the last.
static RUNNING: Mutex<Option<HashMap<&'static str, Arc<AtomicBool>>>> = Mutex::new(None);

/// Start `tool`'s browser login. Returns once it's waiting on the browser; the
/// process keeps running (up to [`LOGIN_LIMIT`]) until it signs in or is
/// cancelled. Blocking for up to [`CODE_LIMIT`]: call it off the main thread.
pub fn start(tool: Tool) -> Result<SignInStart, String> {
    let (id, args): (&'static str, &[&str]) = match tool {
        Tool::Claude => ("claude", &["auth", "login"]),
        Tool::Gh => (
            "gh",
            &[
                "auth",
                "login",
                "--web",
                "--hostname",
                "github.com",
                "--git-protocol",
                "https",
            ],
        ),
        Tool::Git | Tool::Codex => return Err("There's nothing to sign in to.".into()),
    };
    cancel(id);
    let env = build_effective_cli_env(&HashMap::new());
    let path = find_cli_with_env(id, Some(&env)).ok_or(format!("trace couldn't find {id}."))?;
    let mut cmd = crate::platform::process::command(path);
    cmd.args(args)
        .env_clear()
        .envs(&env)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(if tool == Tool::Gh {
            Stdio::piped()
        } else {
            Stdio::null()
        });
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Couldn't start {id}'s sign-in: {e}"))?;

    let started = match child.stderr.take() {
        Some(stderr) => read_gh_prompt(stderr),
        None => Ok(SignInStart::default()),
    };
    match started {
        Ok(start) => {
            watch(id, child);
            Ok(start)
        }
        Err(e) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(e)
        }
    }
}

/// Stop `id`'s login if one is running (the user closed the dialog or gave up).
pub fn cancel(id: &str) {
    let mut running = RUNNING.lock();
    if let Some(flag) = running.get_or_insert_with(HashMap::new).remove(id) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Read `gh`'s stderr until it has given both the code and the URL, then keep
/// draining it on the same thread so `gh` never blocks on a full pipe.
fn read_gh_prompt(stderr: impl std::io::Read + Send + 'static) -> Result<SignInStart, String> {
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = tx.send(line);
        }
    });
    let deadline = Instant::now() + CODE_LIMIT;
    let mut start = SignInStart::default();
    let mut said = Vec::new();
    while start.code.is_none() || start.url.is_none() {
        let left = deadline.saturating_duration_since(Instant::now());
        let Ok(line) = rx.recv_timeout(left) else {
            let why = said.join(" ");
            return Err(format!("GitHub's sign-in didn't start. {why}")
                .trim_end()
                .to_string());
        };
        start.code = start.code.or_else(|| gh_code(&line));
        start.url = start.url.or_else(|| gh_url(&line));
        said.push(line);
    }
    Ok(start)
}

/// `! First copy your one-time code: 7DDB-74D7` → `7DDB-74D7`.
fn gh_code(line: &str) -> Option<String> {
    let (_, code) = line.split_once("one-time code:")?;
    let code = code.trim();
    let ok = !code.is_empty() && code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    ok.then(|| code.to_string())
}

/// The github.com page in `… your web browser: https://github.com/login/device`.
/// Only a github.com page: the renderer opens it.
fn gh_url(line: &str) -> Option<String> {
    let at = line.find("https://github.com/")?;
    let url = line[at..].split_whitespace().next()?;
    Some(url.to_string())
}

/// Wait on the login in the background, stopping it when cancelled or out of
/// time, and forget its flag when it ends.
fn watch(id: &'static str, mut child: Child) {
    let flag = Arc::new(AtomicBool::new(false));
    RUNNING
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(id, flag.clone());
    std::thread::spawn(move || {
        let deadline = Instant::now() + LOGIN_LIMIT;
        loop {
            match child.try_wait() {
                Ok(None) if !flag.load(Ordering::Relaxed) && Instant::now() < deadline => {
                    std::thread::sleep(POLL);
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break;
                }
                _ => break,
            }
        }
        let mut running = RUNNING.lock();
        if let Some(map) = running.as_mut() {
            // Only our own flag: a newer login for the same tool keeps its own.
            if map.get(id).is_some_and(|f| Arc::ptr_eq(f, &flag)) {
                map.remove(id);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_gh_one_time_code_and_page() {
        assert_eq!(
            gh_code("! First copy your one-time code: 7DDB-74D7").as_deref(),
            Some("7DDB-74D7")
        );
        assert_eq!(gh_code("! First copy your one-time code: "), None);
        assert_eq!(gh_code("one-time code: rm -rf /"), None);
        assert_eq!(
            gh_url(
                "Open this URL to continue in your web browser: https://github.com/login/device"
            )
            .as_deref(),
            Some("https://github.com/login/device")
        );
        assert_eq!(gh_url("visit https://evil.example/login"), None);
    }

    #[test]
    fn collects_the_prompt_from_gh_output() {
        let out = "\n! First copy your one-time code: AB12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device\n";
        let start = read_gh_prompt(std::io::Cursor::new(out.to_string())).unwrap();
        assert_eq!(start.code.as_deref(), Some("AB12-CD34"));
        assert_eq!(
            start.url.as_deref(),
            Some("https://github.com/login/device")
        );
    }

    #[test]
    fn says_what_gh_said_when_no_code_comes() {
        let err = read_gh_prompt(std::io::Cursor::new(
            "error connecting to github.com\n".to_string(),
        ))
        .unwrap_err();
        assert!(err.contains("error connecting"), "{err}");
    }

    #[test]
    fn nothing_to_sign_in_to_for_git() {
        assert!(start(Tool::Git).is_err());
        cancel("never-started");
    }
}
