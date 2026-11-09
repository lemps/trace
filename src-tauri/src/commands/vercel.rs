//! Vercel commands: connect the account, choose the Claude login its sandboxes
//! get, and list and join sandbox sessions any trace on the account started.
//! Thin wrappers over `execution::vercel` and `execution::credential`; calls
//! that reach Vercel run on `spawn_blocking`, off the async runtime.

use serde::Serialize;

use crate::commands::session::ScratchSession;
use crate::execution::credential::{self, ClaudeCredential, CredentialKind};
use crate::execution::sandbox::lifetime::{self, Lifetime};
use crate::execution::sandbox::SandboxProvider;
use crate::execution::vercel::{auth, Vercel};

/// The connection as the renderer sees it: no token, and only which kind of
/// Claude login is saved.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VercelStatus {
    user: String,
    team: String,
    project: String,
    claude: Option<CredentialKind>,
}

fn status_of(conn: &auth::Connection) -> VercelStatus {
    VercelStatus {
        user: conn.user.clone(),
        team: conn.team_slug.clone(),
        project: conn.project_name.clone(),
        claude: credential::load().map(|c| c.kind),
    }
}

fn connected() -> Result<auth::Connection, String> {
    auth::load().ok_or_else(|| "Connect Vercel in Integrations first.".to_string())
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("The Vercel call didn't finish: {e}"))?
}

/// How long sandboxes run on their own: idle before stopping, and at most.
#[tauri::command]
pub fn sandbox_lifetime() -> Lifetime {
    lifetime::load()
}

/// Save them (within range); sessions get them from their next start.
#[tauri::command]
pub fn set_sandbox_lifetime(idle_minutes: u32, max_hours: u32) -> Result<Lifetime, String> {
    lifetime::save(Lifetime {
        idle_minutes,
        max_hours,
    })
}

#[tauri::command]
pub fn vercel_status() -> Option<VercelStatus> {
    auth::load().as_ref().map(status_of)
}

#[tauri::command]
pub async fn connect_vercel(token: String) -> Result<VercelStatus, String> {
    let conn = blocking(move || auth::connect(&token)).await?;
    auth::save(&conn)?;
    Ok(status_of(&conn))
}

#[tauri::command]
pub fn disconnect_vercel() {
    auth::clear();
}

#[tauri::command]
pub fn set_claude_credential(kind: String, secret: String) -> Result<VercelStatus, String> {
    let conn = connected()?;
    let kind = CredentialKind::parse(&kind).ok_or("Pick an OAuth token or an API key.")?;
    let cred = ClaudeCredential::new(kind, &secret).ok_or("Paste the token or key.")?;
    credential::save(&cred)?;
    Ok(status_of(&conn))
}

#[tauri::command]
pub fn clear_claude_credential() -> Result<VercelStatus, String> {
    let conn = connected()?;
    credential::clear();
    Ok(status_of(&conn))
}

/// A trace session in a sandbox, found by its labels.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSandboxSession {
    workspace_id: String,
    title: String,
    repo: Option<String>,
    sandbox: String,
    status: String,
    created_at: u64,
}

fn remote_sessions() -> Result<Vec<RemoteSandboxSession>, String> {
    let sandboxes = Vercel::new(connected()?).list("trace", "session")?;
    let mut out: Vec<RemoteSandboxSession> = sandboxes
        .into_iter()
        .filter_map(|s| {
            let workspace_id = s.labels.get("trace.ws")?.clone();
            Some(RemoteSandboxSession {
                title: s
                    .labels
                    .get("trace.title")
                    .cloned()
                    .unwrap_or_else(|| s.name.clone()),
                repo: s.labels.get("trace.repo").cloned(),
                workspace_id,
                sandbox: s.name,
                status: s.status,
                created_at: s.created_at,
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// Every trace session on the account's Vercel project, from any trace.
#[tauri::command]
pub async fn list_remote_sessions() -> Result<Vec<RemoteSandboxSession>, String> {
    blocking(remote_sessions).await
}

/// Make a sandbox session another trace started one of ours, so it can be
/// opened and attached to like any session.
#[tauri::command]
pub async fn join_remote_session(workspace_id: String) -> Result<ScratchSession, String> {
    let wanted = workspace_id.clone();
    let found = blocking(remote_sessions)
        .await?
        .into_iter()
        .find(|s| s.workspace_id == wanted)
        .ok_or("That session isn't on Vercel any more.")?;
    crate::commands::session_host::adopt(
        &found.workspace_id,
        &found.title,
        &found.sandbox,
        found.repo.as_deref(),
        found.created_at / 1000,
    )
}
