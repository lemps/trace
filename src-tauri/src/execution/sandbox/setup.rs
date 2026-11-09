//! The repo's own setup (Settings → Repositories → worktree setup), run in a
//! fresh sandbox after the clone, as `repo_catalog::setup` runs it after a
//! local worktree is made. Commands run in the checkout with the agent's env,
//! so a step that installs private packages from GitHub is logged in the same
//! way the agent is (`egress`). Files the setup copies from the main checkout
//! (a `.env`, say) are this machine's and usually secrets, so they stay here.

use super::ready::Ready;
use super::{script, SandboxProvider};
use crate::repo_catalog::model::SetupConfig;

/// Run the setup's commands in order, stopping at the first that fails.
pub(super) fn run<P: SandboxProvider>(
    provider: &P,
    ready: &Ready,
    setup: &SetupConfig,
    say: &dyn Fn(&str),
) -> Result<(), String> {
    if !setup.copy_files.is_empty() {
        say(&format!(
            "Not copying {} from this machine: files the setup copies stay here.",
            setup.copy_files.join(", ")
        ));
    }
    for line in &setup.commands {
        say(&format!("Setup: {line}"));
        ready.run(
            provider,
            &format!("Setup step `{line}`"),
            script::setup_argv(&ready.dir, line),
            &ready.env,
        )?;
    }
    Ok(())
}
