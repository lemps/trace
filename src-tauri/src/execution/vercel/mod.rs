//! Vercel Sandbox as a [`SandboxProvider`]. Each trace session gets a named,
//! persistent sandbox in the account's `trace-sessions` project, tagged so
//! every trace with the same token can find it.

pub mod auth;
pub mod client;
mod commands;
mod policy;
pub mod pty;

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{json, Value};

use crate::execution::sandbox::egress::{Egress, Injection};
use crate::execution::sandbox::{
    ExecOutput, OutputStream, Preview, PtyStream, SandboxInfo, SandboxProvider, SandboxSpec,
    SelfService,
};
use auth::Connection;

/// How long a stopped session's snapshot is kept (Vercel's own default): long
/// enough to come back to, short enough not to fill a Hobby plan's storage.
const SNAPSHOT_EXPIRY_MS: u64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Clone)]
pub struct Vercel {
    conn: Connection,
}

impl Vercel {
    pub fn new(conn: Connection) -> Vercel {
        Vercel { conn }
    }
}

fn millis(d: Duration) -> u64 {
    u64::try_from(d.as_millis()).unwrap_or(u64::MAX)
}

/// A sandbox from a create, get or list response (`session` is absent in lists).
fn info(sandbox: &Value, session: Option<&Value>) -> SandboxInfo {
    let labels = sandbox["tags"]
        .as_object()
        .map(|tags| {
            tags.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default();
    let session_id = session
        .and_then(|s| s["id"].as_str())
        .or_else(|| sandbox["currentSessionId"].as_str())
        .map(str::to_string);
    let status = sandbox["status"].as_str().unwrap_or_default().to_string();
    let saved = sandbox["currentSnapshotId"]
        .as_str()
        .is_some_and(|id| !id.is_empty());
    // A run stops `timeout` ms after it started; extending the timeout moves it on.
    let stops_at = session
        .filter(|s| s["status"] == "running")
        .and_then(|s| Some(s["startedAt"].as_u64()? + s["timeout"].as_u64()?));
    // A snapshot is kept `snapshotExpiration` ms from when the sandbox stopped.
    let saved_until = (saved && status == "stopped")
        .then(|| {
            Some(sandbox["statusUpdatedAt"].as_u64()? + sandbox["snapshotExpiration"].as_u64()?)
        })
        .flatten();
    SandboxInfo {
        name: sandbox["name"].as_str().unwrap_or_default().to_string(),
        status,
        session_id,
        labels,
        created_at: sandbox["createdAt"].as_u64().unwrap_or_default(),
        persistent: sandbox["persistent"].as_bool().unwrap_or(false),
        saved,
        stops_at,
        saved_until,
        previews: Vec::new(),
    }
}

/// The routes Vercel gives a sandbox's ports: `https://<subdomain>.vercel.run`,
/// as the SDK's `domain(port)` makes it.
fn previews(routes: &Value) -> Vec<Preview> {
    let mut out: Vec<Preview> = routes
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|r| {
            let port = u16::try_from(r["port"].as_u64()?).ok()?;
            let sub = r["subdomain"].as_str()?;
            let ok = !sub.is_empty() && sub.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
            ok.then(|| Preview {
                port,
                url: format!("https://{sub}.vercel.run"),
            })
        })
        .collect();
    // Vercel lists them in no particular order.
    out.sort_by_key(|p| p.port);
    out
}

/// A sandbox from a create or get response, with its routes.
fn info_with_routes(v: &Value) -> SandboxInfo {
    let mut i = info(&v["sandbox"], v.get("session"));
    i.previews = previews(&v["routes"]);
    i
}

impl SandboxProvider for Vercel {
    fn label(&self) -> &'static str {
        "Vercel"
    }

    fn shared(&self) -> std::sync::Arc<dyn SandboxProvider> {
        std::sync::Arc::new(self.clone())
    }

    fn home(&self) -> &'static str {
        "/vercel"
    }

    fn create(&self, spec: &SandboxSpec) -> Result<SandboxInfo, String> {
        let tags: serde_json::Map<String, Value> = spec
            .labels
            .iter()
            .map(|(k, v)| (k.clone(), Value::String(v.clone())))
            .collect();
        let mut body = json!({
            "projectId": self.conn.project_id,
            "name": spec.name,
            "timeout": millis(spec.timeout),
            // Stopping keeps a snapshot, so a stopped session can be resumed.
            // Each is a copy of the whole disk (~1 GB), and Hobby's snapshot
            // storage is small: keep only the latest, for a week.
            "persistent": true,
            "keepLastSnapshots": { "count": 1, "deleteEvicted": true },
            "snapshotExpiration": SNAPSHOT_EXPIRY_MS,
            "tags": tags,
            "ports": spec.ports,
        });
        // Memory follows vCPUs (2 GB each). Unset keeps Vercel's default.
        if let Some(vcpus) = crate::execution::sandbox::size::load().vcpus {
            body["resources"] = json!({ "vcpus": vcpus });
        }
        let v = self.conn.api().post("/v3/sandboxes", &[], &body)?;
        Ok(info_with_routes(&v))
    }

    fn find(&self, name: &str) -> Result<Option<SandboxInfo>, String> {
        let path = format!("/v2/sandboxes/{name}");
        match self
            .conn
            .api()
            .get(&path, &[("projectId", &self.conn.project_id)])
        {
            Ok(v) => Ok(Some(info_with_routes(&v))),
            Err(e) if e.status == 404 => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    fn resume(&self, name: &str) -> Result<SandboxInfo, String> {
        let path = format!("/v2/sandboxes/{name}");
        let query = [
            ("projectId", self.conn.project_id.as_str()),
            ("resume", "true"),
        ];
        let v = self.conn.api().get(&path, &query)?;
        Ok(info_with_routes(&v))
    }

    fn list(&self, key: &str, value: &str) -> Result<Vec<SandboxInfo>, String> {
        let tag = format!("{key}:{value}");
        let mut out = Vec::new();
        let mut cursor: Option<String> = None;
        // A few pages at most: fifty sandboxes each.
        for _ in 0..10 {
            let mut query = vec![
                ("project", self.conn.project_id.as_str()),
                ("tags", tag.as_str()),
                ("limit", "50"),
            ];
            if let Some(c) = cursor.as_deref() {
                query.push(("cursor", c));
            }
            let v = self.conn.api().get("/v2/sandboxes", &query)?;
            out.extend(
                v["sandboxes"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .map(|s| info(s, None)),
            );
            cursor = v["pagination"]["next"].as_str().map(str::to_string);
            if cursor.is_none() {
                break;
            }
        }
        Ok(out)
    }

    /// Deletes its snapshot too: Vercel keeps a deleted sandbox's snapshot,
    /// which once filled a Hobby account's storage and blocked every sandbox.
    fn remove(&self, name: &str) -> Result<(), String> {
        let path = format!("/v2/sandboxes/{name}");
        let query = [("projectId", self.conn.project_id.as_str())];
        let api = self.conn.api();
        let snapshot = api.get(&path, &query).ok().and_then(|v| {
            v["sandbox"]["currentSnapshotId"]
                .as_str()
                .map(str::to_string)
        });
        api.delete(&path, &query)?;
        if let Some(id) = snapshot {
            match api.delete(&format!("/v1/sandboxes/snapshots/{id}"), &[]) {
                Ok(_) => {}
                Err(e) if e.status == 404 => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(())
    }

    fn exec(
        &self,
        session_id: &str,
        argv: &[String],
        env: &HashMap<String, String>,
    ) -> Result<ExecOutput, String> {
        let (command, args) = argv.split_first().ok_or("No command to run.")?;
        let body =
            json!({ "command": command, "args": args, "env": env, "wait": true, "logs": true });
        Ok(self.conn.api().exec(session_id, &body)?)
    }

    fn open_pty(
        &self,
        session_id: &str,
        argv: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<Box<dyn PtyStream>, String> {
        let pty = pty::open(&self.conn.api(), session_id, argv, cwd, cols, rows)?;
        Ok(Box::new(pty))
    }

    fn start_command(
        &self,
        session_id: &str,
        argv: &[String],
        env: &HashMap<String, String>,
        cwd: &str,
    ) -> Result<String, String> {
        commands::start(&self.conn.api(), session_id, argv, env, cwd)
    }

    fn write_stdin(&self, session_id: &str, command_id: &str, data: &[u8]) -> Result<(), String> {
        commands::write_stdin(&self.conn.api(), session_id, command_id, data)
    }

    fn close_stdin(&self, session_id: &str, command_id: &str) -> Result<(), String> {
        commands::close_stdin(&self.conn.api(), session_id, command_id)
    }

    fn command_output(&self, session_id: &str, command_id: &str) -> Result<OutputStream, String> {
        commands::output(&self.conn.api(), session_id, command_id)
    }

    fn kill_command(&self, session_id: &str, command_id: &str) -> Result<(), String> {
        commands::kill(&self.conn.api(), session_id, command_id)
    }

    fn command_done(&self, session_id: &str, command_id: &str) -> Result<bool, String> {
        commands::done(&self.conn.api(), session_id, command_id)
    }

    fn wait_command(&self, session_id: &str, command_id: &str) -> Result<Option<i32>, String> {
        commands::wait(&self.conn.api(), session_id, command_id)
    }

    /// The running session first, so it applies now, then the sandbox, so a
    /// resume after a stop gets it too.
    fn set_egress(&self, name: &str, session_id: &str, egress: &Egress) -> Result<(), String> {
        let policy = policy::to_json(egress);
        let api = self.conn.api();
        let path = format!("/v2/sandboxes/sessions/{session_id}/network-policy");
        api.post(&path, &[], &policy)?;
        let query = [("projectId", self.conn.project_id.as_str())];
        api.patch(
            &format!("/v2/sandboxes/{name}"),
            &query,
            &json!({ "networkPolicy": policy }),
        )?;
        Ok(())
    }

    fn set_ports(&self, name: &str, ports: &[u16]) -> Result<Vec<Preview>, String> {
        let query = [("projectId", self.conn.project_id.as_str())];
        let v = self.conn.api().patch(
            &format!("/v2/sandboxes/{name}"),
            &query,
            &json!({ "ports": ports }),
        )?;
        Ok(previews(&v["routes"]))
    }

    /// Only `POST` to this session's own extend and stop: any other call to
    /// Vercel's API from the sandbox goes out without the token.
    fn self_service(&self, session_id: &str) -> Option<SelfService> {
        let path = |end: &str| format!("/v2/sandboxes/sessions/{session_id}/{end}");
        let url = |end: &str| match self.conn.team_id.as_str() {
            "" => format!("{}{}", client::API, path(end)),
            team => format!("{}{}?teamId={team}", client::API, path(end)),
        };
        let inject = |end: &str| Injection {
            domain: "api.vercel.com".to_string(),
            headers: vec![("Authorization".to_string(), self.conn.bearer())],
            path: Some(path(end)),
            methods: vec!["POST".to_string()],
            ..Injection::default()
        };
        Some(SelfService {
            injections: vec![inject("extend-timeout"), inject("stop")],
            extend_url: url("extend-timeout"),
            stop_url: url("stop"),
        })
    }

    fn extend(&self, session_id: &str, by: Duration) -> Result<(), String> {
        let path = format!("/v2/sandboxes/sessions/{session_id}/extend-timeout");
        self.conn
            .api()
            .post(&path, &[], &json!({ "duration": millis(by) }))?;
        Ok(())
    }

    fn stop(&self, session_id: &str) -> Result<(), String> {
        let path = format!("/v2/sandboxes/sessions/{session_id}/stop");
        self.conn.api().post(&path, &[], &json!({}))?;
        Ok(())
    }
}

#[cfg(test)]
mod live_egress_tests;
#[cfg(test)]
mod live_events_tests;
#[cfg(test)]
mod live_files_tests;
#[cfg(test)]
mod live_keepalive_tests;
#[cfg(test)]
mod live_mcp_tests;
#[cfg(test)]
mod live_preview_tests;
#[cfg(test)]
mod live_tests;
#[cfg(test)]
mod live_tools_tests;

#[cfg(test)]
#[path = "info_tests.rs"]
mod tests;
