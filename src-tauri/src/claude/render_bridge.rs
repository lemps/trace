//! Out-of-band bridge from an agent to its Plan tab (and, for `trace-hook`, its turns).
//!
//! A Claude agent can't push bytes onto its own chat PTY (Claude runs its Bash
//! tool in a captured, tty-less shell), so the OSC-in-the-terminal channel can't
//! be driven by the agent. Instead the agent runs `trace-render`, which opens a
//! loopback TCP connection to this listener; the listener validates a per-session
//! token and publishes the document (Markdown or HTML) to the workspace's Plan tab
//! (`plans::publish`).
//!
//! Security: binds `127.0.0.1` only (never network-exposed), and every message
//! must carry a random per-app-session token, compared in constant time. The
//! token reaches agents only via their (user-private) process env, so other local
//! processes can't inject cards.

use std::io::{BufRead, BufReader, Read};
use std::net::{TcpListener, TcpStream};

use base64::Engine;
use tauri::AppHandle;

use crate::helpers::{new_id, trace_bin_dir};
use crate::plans::model::PlanFormat;
use crate::platform::ports::AgentBridge;
use crate::platform::Os;

/// The producer script trace places on every agent's PATH. It reads the bridge
/// coordinates from the agent's env (set in `commands::agent::spawn_in`) and
/// carries no secret itself. Accepts an HTML file arg or HTML on stdin.
const PRODUCER_SCRIPT: &str = r#"#!/usr/bin/env bash
# trace-render: publish a document to this agent's Plan tab in trace, where the
# user reads it, sees its versions and exports it (Markdown, PDF, HTML).
#   trace-render plan.md                       # Markdown, titled by its first heading
#   trace-render --title "Rollout plan" plan.md
#   echo '# Plan' | trace-render --md          # Markdown from stdin
#   trace-render report.html                   # HTML (shown sandboxed, no scripts)
#   echo '<h2>Hi</h2>' | trace-render          # HTML from stdin
# Publishing again with the same title adds a new version of that document.
set -euo pipefail

if [ -z "${TRACE_RENDER_PORT:-}" ] || [ -z "${TRACE_RENDER_TOKEN:-}" ] || [ -z "${TRACE_ISSUE_KEY:-}" ]; then
  echo "trace-render: not running inside a trace agent (TRACE_RENDER_* unset)" >&2
  exit 1
fi

format="" title="" file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --md|--markdown) format="md" ;;
    --html) format="html" ;;
    --title) shift; title="${1:-}" ;;
    --title=*) title="${1#--title=}" ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) file="$1" ;;
  esac
  shift
done

if [ -n "$file" ]; then
  body="$(cat "$file")"
  case "$file" in
    *.md|*.markdown|*.MD) [ -n "$format" ] || format="md" ;;
  esac
else
  body="$(cat)"
fi
[ -n "$format" ] || format="html"

# base64 keeps each part on one space-free, newline-free line, so the listener
# can frame the message as "<token> <issueKey> @<format> <title> <body>".
b64() { printf '%s' "$1" | base64 | tr -d '\n'; }
t="-"
[ -z "$title" ] || t="$(b64 "$title")"
msg="$TRACE_RENDER_TOKEN $TRACE_ISSUE_KEY @$format $t $(b64 "$body")"

# Prefer bash's /dev/tcp (no external tool); fall back to nc.
reply=""
if exec 3<>"/dev/tcp/127.0.0.1/$TRACE_RENDER_PORT" 2>/dev/null; then
  printf '%s\n' "$msg" >&3
  IFS= read -r -t 10 reply <&3 || true
  exec 3<&-
elif command -v nc >/dev/null 2>&1; then
  reply="$(printf '%s\n' "$msg" | nc -w 10 127.0.0.1 "$TRACE_RENDER_PORT" | head -n 1)"
else
  echo "trace-render: cannot reach trace (no /dev/tcp or nc)" >&2
  exit 1
fi
case "$reply" in
  ok:*) echo "trace-render: ${reply#ok: }" ;;
  error:*) echo "trace-render: ${reply#error: }" >&2; exit 1 ;;
  *) echo "trace-render: sent, but trace didn't confirm it" >&2 ;;
esac
"#;

/// Cap a single message at ~8 MiB of base64 (~6 MiB of HTML) so a malformed or
/// hostile client can't exhaust memory on one line.
const MAX_MESSAGE_BYTES: u64 = 8 * 1024 * 1024;

/// Coordinates an agent needs to reach the bridge. Stored once in `AppState`.
/// `port == 0` marks a disabled bridge (bind failed) — callers skip env injection.
#[derive(Clone, Default)]
pub struct RenderBridge {
    pub port: u16,
    pub token: String,
}

/// Bind the loopback listener, write the producer script, and spawn the accept
/// loop. Returns the port + token to inject into agent envs. Errors propagate so
/// the caller can store a disabled bridge instead.
pub fn start(app: AppHandle) -> std::io::Result<RenderBridge> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    let token = new_id();
    let bridge = RenderBridge {
        port,
        token: token.clone(),
    };

    // Best-effort: a missing script just means agents lack the convenience CLI.
    let _ = write_producer_script();

    // A plain OS thread (not tokio) per the project's PTY-pump convention.
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let app = app.clone();
            let token = token.clone();
            std::thread::spawn(move || handle_conn(stream, &app, &token));
        }
    });

    Ok(bridge)
}

/// Read one framed message, authenticate it, and emit the event. Anything
/// malformed is dropped silently — this endpoint is fed by untrusted local input.
fn handle_conn(stream: TcpStream, app: &AppHandle, token: &str) {
    let reply_to = stream.try_clone().ok();
    let mut line = String::new();
    if BufReader::new(stream)
        .take(MAX_MESSAGE_BYTES)
        .read_line(&mut line)
        .is_err()
    {
        return;
    }
    let mut parts = line.trim_end().splitn(3, ' ');
    let (Some(got_token), Some(issue_key), Some(b64)) = (parts.next(), parts.next(), parts.next())
    else {
        return;
    };
    if !constant_time_eq(got_token.as_bytes(), token.as_bytes()) {
        return;
    }
    // Turn events from an agent's `trace-hook` (`claude::hooks`) — '!' can't
    // start a base64 payload, so the two message kinds can't collide.
    if let Some(event) = b64.strip_prefix('!') {
        crate::claude::hooks::on_hook(app, issue_key, event);
        return;
    }
    // Authenticated: `trace-render` waits for one line saying how it went.
    let outcome = match parse_publish(b64) {
        None => Err("trace couldn't read the document (empty, or cut short).".to_string()),
        Some(m) => {
            let title = m.title.as_deref();
            crate::plans::publish(app, issue_key, m.format, title, m.body, None).map(|doc| {
                format!(
                    "ok: published \"{}\" (version {}) to the Plan tab",
                    doc.title, doc.version
                )
            })
        }
    };
    let reply = outcome.unwrap_or_else(|e| format!("error: {e}"));
    if let Some(mut out) = reply_to {
        use std::io::Write;
        let _ = writeln!(out, "{}", reply.replace('\n', " "));
    }
}

/// A document `trace-render` sent: `@<md|html> <base64 title, or -> <base64 body>`,
/// or, from an older script, the base64 HTML alone.
#[derive(Debug, PartialEq)]
struct Publish {
    format: PlanFormat,
    title: Option<String>,
    body: String,
}

fn decode_text(b64: &str) -> Option<String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    String::from_utf8(bytes).ok()
}

fn parse_publish(payload: &str) -> Option<Publish> {
    let Some(framed) = payload.strip_prefix('@') else {
        return Some(Publish {
            format: PlanFormat::Html,
            title: None,
            body: decode_text(payload)?,
        });
    };
    let mut parts = framed.splitn(3, ' ');
    let format = match parts.next()? {
        "md" => PlanFormat::Markdown,
        "html" => PlanFormat::Html,
        _ => return None,
    };
    let title = match parts.next()? {
        "-" => None,
        t => Some(decode_text(t)?),
    };
    Some(Publish {
        format,
        title,
        body: decode_text(parts.next()?).filter(|b| !b.is_empty())?,
    })
}

/// Constant-time byte comparison so a token check can't be timed. (The length is
/// not secret — the token is a fixed-width UUID — so an early length bail is fine.)
pub(crate) fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Write the `trace-render` producer to trace's bin dir and mark it executable.
/// The script holds no secret (it reads the token from env), so 0755 is fine.
fn write_producer_script() -> std::io::Result<()> {
    let bin = trace_bin_dir();
    std::fs::create_dir_all(&bin)?;
    let path = bin.join("trace-render");
    Os::install_script(&path, PRODUCER_SCRIPT)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(s: &str) -> String {
        base64::engine::general_purpose::STANDARD.encode(s)
    }

    #[test]
    fn markdown_and_html_payloads_with_and_without_a_title() {
        let md = format!(
            "@md {} {}",
            b64("Rollout plan"),
            b64("# Plan
1. a")
        );
        assert_eq!(
            parse_publish(&md),
            Some(Publish {
                format: PlanFormat::Markdown,
                title: Some("Rollout plan".into()),
                body: "# Plan
1. a"
                    .into()
            })
        );
        let html = format!("@html - {}", b64("<p>x</p>"));
        assert_eq!(parse_publish(&html).unwrap().title, None);
        // An older trace-render sends the HTML alone.
        let old = parse_publish(&b64("<h2>Hi</h2>")).unwrap();
        assert_eq!(
            (old.format, old.body.as_str()),
            (PlanFormat::Html, "<h2>Hi</h2>")
        );
    }

    #[test]
    fn malformed_payloads_are_dropped() {
        assert_eq!(parse_publish("@pdf - eA=="), None);
        assert_eq!(parse_publish("@md - "), None);
        assert_eq!(parse_publish("@md"), None);
        assert_eq!(parse_publish("@md !!! eA=="), None);
        assert_eq!(parse_publish("not base64!"), None);
    }
}
