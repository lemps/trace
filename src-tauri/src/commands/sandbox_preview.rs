//! A sandbox session's Browser tab: `localhost:<port>` is its sandbox's dev
//! server, so it opens at the port's preview URL (`execution::sandbox::preview`).
//! Only a loopback URL in a sandbox session costs a provider call.

use crate::execution::sandbox::{preview, SandboxProvider};
use crate::execution::vercel::{auth, Vercel};
use crate::execution::SessionHost;

/// `url` as `workspace_id`'s agent means it: unchanged unless it's a loopback
/// URL in a sandbox session whose port has a preview.
pub(crate) async fn for_workspace(workspace_id: &str, url: String) -> String {
    if !preview::is_loopback(&url) {
        return url;
    }
    let Some(SessionHost::Vercel { sandbox, .. }) =
        crate::commands::issue_host::host_of(workspace_id)
    else {
        return url;
    };
    let asked = url.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let vercel = Vercel::new(auth::load()?);
        let info = vercel.find(&sandbox).ok()??;
        preview::rewrite(&info.previews, &asked)
    })
    .await
    .ok()
    .flatten()
    .unwrap_or(url)
}
