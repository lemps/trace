//! Vercel's REST API (`https://api.vercel.com`), blocking: called from a
//! session's thread or `spawn_blocking`, never on the async runtime. The token
//! goes only in the `Authorization` header and is never logged or put in an
//! error.

use std::io::{BufRead, BufReader};
use std::sync::OnceLock;
use std::time::Duration;

use serde_json::Value;

use crate::execution::sandbox::ExecOutput;

const API: &str = "https://api.vercel.com";

/// A failed call: the HTTP status (0 when nothing came back) and Vercel's message.
#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub message: String,
}

impl From<ApiError> for String {
    fn from(e: ApiError) -> String {
        e.message
    }
}

fn http() -> Result<&'static reqwest::blocking::Client, ApiError> {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = reqwest::blocking::Client::builder()
        .user_agent("trace")
        // Long enough for a clone or setup command run with `wait`.
        .timeout(Duration::from_secs(15 * 60))
        .build()
        .map_err(|e| ApiError {
            status: 0,
            message: format!("Couldn't start an HTTP client: {e}"),
        })?;
    Ok(CLIENT.get_or_init(|| built))
}

/// For responses read as they come (a command's output, waiting on one): no
/// overall timeout, since a chat agent's output stream lasts as long as it does.
fn http_stream() -> Result<&'static reqwest::blocking::Client, ApiError> {
    static CLIENT: OnceLock<reqwest::blocking::Client> = OnceLock::new();
    if let Some(c) = CLIENT.get() {
        return Ok(c);
    }
    let built = reqwest::blocking::Client::builder()
        .user_agent("trace")
        // The blocking client otherwise ends any request after 30 s, which
        // cut a chat's output while the user was still typing.
        .timeout(None)
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| ApiError {
            status: 0,
            message: format!("Couldn't start an HTTP client: {e}"),
        })?;
    Ok(CLIENT.get_or_init(|| built))
}

/// One account's access, scoped to a team once it's known.
#[derive(Clone)]
pub struct Api {
    token: String,
    team_id: String,
}

impl std::fmt::Debug for Api {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Api(team {}, <token>)", self.team_id)
    }
}

impl Api {
    pub fn new(token: &str, team_id: &str) -> Api {
        Api {
            token: token.trim().to_string(),
            team_id: team_id.to_string(),
        }
    }

    fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<reqwest::blocking::RequestBuilder, ApiError> {
        self.request_on(http()?, method, path, query)
    }

    fn request_on(
        &self,
        client: &reqwest::blocking::Client,
        method: reqwest::Method,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<reqwest::blocking::RequestBuilder, ApiError> {
        let mut q: Vec<(&str, &str)> = query.to_vec();
        if !self.team_id.is_empty() {
            q.push(("teamId", &self.team_id));
        }
        Ok(client
            .request(method, format!("{API}{path}"))
            .bearer_auth(&self.token)
            .query(&q))
    }

    pub fn get(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, ApiError> {
        send(self.request(reqwest::Method::GET, path, query)?)
    }

    pub fn post(
        &self,
        path: &str,
        query: &[(&str, &str)],
        body: &Value,
    ) -> Result<Value, ApiError> {
        send(self.request(reqwest::Method::POST, path, query)?.json(body))
    }

    pub fn delete(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, ApiError> {
        send(self.request(reqwest::Method::DELETE, path, query)?)
    }

    /// A GET whose body is read as it comes (no overall timeout).
    pub fn get_stream(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<reqwest::blocking::Response, ApiError> {
        let res = self
            .request_on(http_stream()?, reqwest::Method::GET, path, query)?
            .send()
            .map_err(transport)?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            return Err(api_error(status, &res.text().unwrap_or_default()));
        }
        Ok(res)
    }

    /// Run a command to completion, reading its ND-JSON log stream.
    pub fn exec(&self, session_id: &str, body: &Value) -> Result<ExecOutput, ApiError> {
        let path = format!("/v2/sandboxes/sessions/{session_id}/cmd");
        let res = self
            .request(reqwest::Method::POST, &path, &[])?
            .json(body)
            .send()
            .map_err(transport)?;
        if !res.status().is_success() {
            let status = res.status().as_u16();
            return Err(api_error(status, &res.text().unwrap_or_default()));
        }
        let mut out = ExecOutput::default();
        for line in BufReader::new(res).lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match (v["stream"].as_str(), v["data"].as_str()) {
                (Some("stdout"), Some(d)) => out.stdout.push_str(d),
                (Some("stderr"), Some(d)) => out.stderr.push_str(d),
                _ => {
                    let cmd = if v.get("command").is_some() {
                        &v["command"]
                    } else {
                        &v
                    };
                    if let Some(code) = cmd["exitCode"].as_i64() {
                        out.exit_code = i32::try_from(code).ok();
                    }
                }
            }
        }
        Ok(out)
    }
}

fn send(req: reqwest::blocking::RequestBuilder) -> Result<Value, ApiError> {
    let res = req.send().map_err(transport)?;
    let status = res.status().as_u16();
    let text = res.text().unwrap_or_default();
    if !(200..300).contains(&status) {
        return Err(api_error(status, &text));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

fn transport(e: reqwest::Error) -> ApiError {
    // The causes under it (a timeout, a refused connection) say what went wrong.
    let mut causes = String::new();
    let mut cause = std::error::Error::source(&e);
    while let Some(c) = cause {
        causes.push_str(&format!(": {c}"));
        cause = c.source();
    }
    // Without the URL: it can carry a team id, and never needs to be shown.
    ApiError {
        status: 0,
        message: format!("Couldn't reach Vercel: {}{causes}", e.without_url()),
    }
}

fn api_error(status: u16, body: &str) -> ApiError {
    let said = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string));
    let message = match (status, said) {
        (401 | 403, _) => {
            "Vercel refused the token. Check it hasn't expired and can see the team.".to_string()
        }
        (_, Some(m)) => format!("Vercel: {m}"),
        _ => format!("Vercel answered {status}."),
    };
    ApiError { status, message }
}
