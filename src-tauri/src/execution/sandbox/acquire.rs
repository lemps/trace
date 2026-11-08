//! Getting a session's sandbox running: join it if it's up, resume it from its
//! snapshot if it stopped, or make it. The rest of the setup (`host::ready`)
//! depends on which it was.

use super::host::{labels, SandboxTarget, SANDBOX_TIMEOUT};
use super::{SandboxInfo, SandboxProvider, SandboxSpec};

/// How the session's sandbox was got.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Got {
    /// Already running: the agent may be too.
    Joined,
    /// Started again from its snapshot: files back, nothing running.
    Resumed,
    /// New: nothing in it yet.
    Created,
}

/// The session's sandbox, running: joined, resumed from its snapshot, or made.
/// Returns the provider's session id for it.
pub(super) fn sandbox_session<P: SandboxProvider>(
    provider: &P,
    target: &SandboxTarget,
    say: &dyn Fn(&str),
) -> Result<(String, Got), String> {
    let existing = provider.find(&target.sandbox)?;
    if let Some(info) = &existing {
        if let (true, Some(id)) = (info.is_running(), info.session_id.clone()) {
            say(&format!("Joining its {} sandbox…", provider.label()));
            return Ok((id, Got::Joined));
        }
        if info.persistent {
            say(&format!("Resuming its {} sandbox…", provider.label()));
            match provider.resume(&target.sandbox) {
                Ok(SandboxInfo {
                    session_id: Some(id),
                    ..
                }) => return Ok((id, Got::Resumed)),
                // Its snapshot expired, or it can't be resumed: start over.
                Ok(_) | Err(_) => say("Couldn't resume it, so starting a new one."),
            }
        }
        // A stopped sandbox keeps its name until it's deleted.
        provider.remove(&target.sandbox)?;
    }
    say(&format!("Starting a {} sandbox…", provider.label()));
    let info = provider.create(&SandboxSpec {
        name: target.sandbox.clone(),
        labels: labels(target),
        timeout: SANDBOX_TIMEOUT,
    })?;
    let id = info
        .session_id
        .ok_or("The sandbox started without a session.")?;
    Ok((id, Got::Created))
}
