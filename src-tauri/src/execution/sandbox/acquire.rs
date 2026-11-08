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
    let existing = settled(provider, target, say)?;
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

/// How long to wait for a sandbox mid-change (saving after a stop, starting).
const SETTLE_WAIT: std::time::Duration = std::time::Duration::from_secs(120);

/// The session's sandbox once it isn't mid-change: a Start pressed while it's
/// still being saved after a Stop waits for the save rather than tripping on it.
fn settled<P: SandboxProvider>(
    provider: &P,
    target: &SandboxTarget,
    say: &dyn Fn(&str),
) -> Result<Option<SandboxInfo>, String> {
    let deadline = std::time::Instant::now() + SETTLE_WAIT;
    let mut told = false;
    loop {
        let info = provider.find(&target.sandbox)?;
        let busy = info.as_ref().is_some_and(|i| changing(&i.status));
        if !busy || std::time::Instant::now() > deadline {
            return Ok(info);
        }
        if !std::mem::replace(&mut told, true) {
            say("Waiting for its last save to finish…");
        }
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}

/// A status a sandbox passes through on its way to running or stopped.
fn changing(status: &str) -> bool {
    matches!(status, "stopping" | "snapshotting" | "pending" | "starting")
}

#[cfg(test)]
mod tests {
    use super::changing;

    #[test]
    fn only_passing_states_are_waited_out() {
        assert!(changing("stopping") && changing("snapshotting"));
        assert!(!changing("running") && !changing("stopped") && !changing("failed"));
    }
}
