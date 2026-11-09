//! Keeping a running sandbox's network logins current while trace is open.
//! Most don't change, but an MCP server's access token lasts about an hour:
//! every few minutes the store refreshes any close to expiring, and if that
//! changed the policy, it's sent again. One watcher per sandbox; it ends when
//! the sandbox stops or starts a new session. With trace closed, nothing
//! refreshes them, so an MCP login lasts as long as its last token.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use super::ready::{policy, Sources};
use super::SandboxProvider;

const EVERY: Duration = Duration::from_secs(5 * 60);

/// The sandboxes being watched, and the session each watcher is for.
fn watched() -> &'static Mutex<HashMap<String, String>> {
    static W: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    W.get_or_init(Default::default)
}

/// Watch `sandbox`'s session `session_id`, unless it's watched already.
pub fn watch(
    provider: Arc<dyn SandboxProvider>,
    sandbox: &str,
    session_id: &str,
    sources: Sources,
) {
    {
        let Ok(mut w) = watched().lock() else { return };
        if w.get(sandbox).map(String::as_str) == Some(session_id) {
            return;
        }
        w.insert(sandbox.to_string(), session_id.to_string());
    }
    let (sandbox, sid) = (sandbox.to_string(), session_id.to_string());
    std::thread::spawn(move || {
        let mut last = policy(&*provider, &sid, &sources);
        loop {
            std::thread::sleep(EVERY);
            let ours = watched()
                .lock()
                .map(|w| w.get(&sandbox) == Some(&sid))
                .unwrap_or(false);
            let running = matches!(
                provider.find(&sandbox),
                Ok(Some(info)) if info.is_running() && info.session_id.as_deref() == Some(sid.as_str())
            );
            if !ours || !running {
                break;
            }
            let now = policy(&*provider, &sid, &sources);
            if now != last && provider.set_egress(&sandbox, &sid, &now).is_ok() {
                last = now;
            }
        }
        if let Ok(mut w) = watched().lock() {
            if w.get(&sandbox) == Some(&sid) {
                w.remove(&sandbox);
            }
        }
    });
}
