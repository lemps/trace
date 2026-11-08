//! A terminal on a command in a Vercel sandbox: a WebSocket from
//! `POST /v2/sandboxes/sessions/{id}/interactive`. Not in Vercel's public API
//! spec, but used the same way by its JS SDK, Python SDK and CLI, and tried
//! from Rust on a live sandbox (`docs/REMOTE_EXECUTION_PLAN.md`, spike 0.1).
//!
//! Binary frames carry terminal bytes both ways. Text frames carry JSON control:
//! `start` and `resize` from us; `exit` from the sandbox, after which it drops
//! the connection without a TLS close, which counts as a normal end.

use std::net::TcpStream;
use std::time::Duration;

use serde_json::json;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

use super::client::Api;
use crate::execution::sandbox::{PtyRead, PtyStream};

/// How long a read waits before reporting `Idle`, so the owner thread can send.
const READ_WAIT: Duration = Duration::from_millis(40);

pub struct WsPty {
    ws: WebSocket<MaybeTlsStream<TcpStream>>,
    ended: bool,
}

/// Open a terminal running `argv` in `cwd`. The socket's URL carries a token,
/// so neither the URL nor an error quoting it is ever shown.
pub fn open(
    api: &Api,
    session_id: &str,
    argv: &[String],
    cwd: &str,
    cols: u16,
    rows: u16,
) -> Result<WsPty, String> {
    let path = format!("/v2/sandboxes/sessions/{session_id}/interactive");
    let v = api.post(&path, &[], &json!({}))?;
    let (Some(url), Some(token)) = (v["url"].as_str(), v["token"].as_str()) else {
        return Err("Vercel didn't offer a terminal for this sandbox.".to_string());
    };
    wait_healthy(url);
    let full = format!("{url}?token={}", encode(token));
    let (mut ws, _) = tungstenite::connect(full.as_str()).map_err(|e| {
        format!(
            "Couldn't open the sandbox terminal: {}",
            e.to_string().replace(token, "…")
        )
    })?;
    let stream = match ws.get_mut() {
        MaybeTlsStream::Rustls(s) => Some(s.get_mut()),
        MaybeTlsStream::Plain(s) => Some(s),
        _ => None,
    };
    if let Some(tcp) = stream {
        let _ = tcp.set_read_timeout(Some(READ_WAIT));
        let _ = tcp.set_nodelay(true);
    }
    let (command, args) = argv.split_first().ok_or("No command to run.")?;
    let start = json!({
        "type": "start",
        "command": command,
        "args": args,
        "env": ["TERM=xterm-256color"],
        "cwd": cwd,
        "cols": cols,
        "rows": rows,
    });
    ws.send(Message::Text(start.to_string()))
        .map_err(|e| format!("Couldn't start the sandbox terminal: {e}"))?;
    Ok(WsPty { ws, ended: false })
}

/// The terminal server can take a moment to come up; Vercel's own clients poll
/// `/health` first. Best-effort: the connect reports a real failure.
fn wait_healthy(url: &str) {
    let host = url
        .split("://")
        .nth(1)
        .and_then(|r| r.split('/').next())
        .unwrap_or("");
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    else {
        return;
    };
    for attempt in 0..5u64 {
        if let Ok(res) = client.get(format!("https://{host}/health")).send() {
            if res.status().is_success() {
                return;
            }
        }
        std::thread::sleep(Duration::from_millis(200 * (attempt + 1)));
    }
}

/// Percent-encode a query value.
fn encode(raw: &str) -> String {
    raw.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

impl PtyStream for WsPty {
    fn send_input(&mut self, data: &[u8]) -> Result<(), String> {
        self.ws
            .send(Message::Binary(data.to_vec()))
            .map_err(|e| e.to_string())
    }

    fn send_resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        let msg = json!({ "type": "resize", "cols": cols, "rows": rows });
        self.ws
            .send(Message::Text(msg.to_string()))
            .map_err(|e| e.to_string())
    }

    fn read(&mut self) -> PtyRead {
        match self.ws.read() {
            Ok(Message::Binary(bytes)) => PtyRead::Data(bytes.to_vec()),
            Ok(Message::Text(text)) => {
                let kind = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| v["type"].as_str().map(str::to_string));
                match kind.as_deref() {
                    Some("exit") => {
                        self.ended = true;
                        PtyRead::Ended
                    }
                    Some(_) => PtyRead::Idle,
                    None => PtyRead::Data(text.as_bytes().to_vec()),
                }
            }
            Ok(Message::Close(_)) => PtyRead::Ended,
            Ok(_) => PtyRead::Idle,
            Err(tungstenite::Error::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) =>
            {
                PtyRead::Idle
            }
            Err(_) if self.ended => PtyRead::Ended,
            Err(e) => PtyRead::Failed(e.to_string()),
        }
    }

    fn close(&mut self) {
        let _ = self.ws.close(None);
        let _ = self.ws.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::encode;

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(encode("abc-_.~123"), "abc-_.~123");
        assert_eq!(encode("a b+c/="), "a%20b%2Bc%2F%3D");
    }
}
