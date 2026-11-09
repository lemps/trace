//! Connecting trace to a Vercel account: check the token, find its team, and
//! find or make the project trace keeps its sandboxes in. Saved to a user-only
//! (`0600`) file like the tracker credentials; the token never crosses to the
//! renderer and is never logged.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::client::Api;
use crate::helpers::persist::{self, Style};
use crate::helpers::trace_dir;

/// The project every trace on the account uses, so they all see one list.
pub const PROJECT_NAME: &str = "trace-sessions";

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    token: String,
    pub user: String,
    pub team_id: String,
    pub team_slug: String,
    pub project_id: String,
    pub project_name: String,
}

impl std::fmt::Debug for Connection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Connection({} / {}, <token>)",
            self.team_slug, self.project_name
        )
    }
}

impl Connection {
    pub fn api(&self) -> Api {
        Api::new(&self.token, &self.team_id)
    }

    /// The token, for the one header that carries it: a sandbox network's
    /// injection, scoped to that sandbox's own session (`self_service`).
    pub(crate) fn bearer(&self) -> String {
        format!("Bearer {}", self.token)
    }
}

/// Check `token` and set the account up. Blocking.
pub fn connect(token: &str) -> Result<Connection, String> {
    let token = token.trim();
    if token.is_empty() || token.chars().any(char::is_whitespace) {
        return Err("Paste a Vercel token.".to_string());
    }
    let me = Api::new(token, "").get("/v2/user", &[])?;
    let user = me["user"]["username"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let team_id = me["user"]["defaultTeamId"]
        .as_str()
        .ok_or("This Vercel account has no team to run sandboxes in.")?
        .to_string();
    let api = Api::new(token, &team_id);
    let team = api.get(&format!("/v2/teams/{team_id}"), &[])?;
    let team_slug = team["slug"].as_str().unwrap_or(&team_id).to_string();
    let project = match api.get(&format!("/v9/projects/{PROJECT_NAME}"), &[]) {
        Ok(p) => p,
        Err(e) if e.status == 404 => {
            api.post("/v11/projects", &[], &json!({ "name": PROJECT_NAME }))?
        }
        Err(e) => return Err(e.into()),
    };
    let project_id = project["id"]
        .as_str()
        .ok_or("Vercel didn't return the project.")?
        .to_string();
    Ok(Connection {
        token: token.to_string(),
        user,
        team_id,
        team_slug,
        project_id,
        project_name: PROJECT_NAME.to_string(),
    })
}

fn path() -> PathBuf {
    trace_dir().join("vercel.json")
}

pub fn load() -> Option<Connection> {
    persist::read_or_log::<Option<Connection>>(&path())
}

pub fn save(conn: &Connection) -> Result<(), String> {
    persist::write_json(&path(), Style::Compact, conn)
}

pub fn clear() {
    persist::remove(&path());
}
