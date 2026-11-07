//! The portable checkout step: put repo X at branch Y into a folder with token
//! T, then run the repo's setup. Nothing here knows about the desktop app (no
//! `AppHandle`, no `gh`, no config dir, no tool discovery): the caller hands in
//! how to start `git` and the env for setup commands, so a remote runner (the
//! roadmap's Cloud VMs) can run the same step in a fresh sandbox.
//!
//! The token reaches git only through the clone's environment, as a
//! `GIT_CONFIG_*` `http.<github>.extraHeader` (git ≥ 2.31): it is never in the
//! remote URL, the command's arguments or `.git/config`, and is redacted from
//! any error. Later fetches use whatever credentials the checkout's user has.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use super::token::{redact, Token};
use crate::repo_catalog::model::{RemoteRepo, SetupConfig};
use crate::repo_catalog::setup::run_steps;

const GITHUB: &str = "https://github.com";

/// One checkout to make.
#[derive(Debug, Clone)]
pub struct RepoCheckout {
    pub remote: RemoteRepo,
    /// The branch to check out; the repo's default when None.
    pub branch: Option<String>,
    /// For private repos. None clones anonymously (public repos).
    pub token: Option<Token>,
    /// The folder to create. Must not exist yet.
    pub dest: PathBuf,
    /// Run in `dest` once it's checked out. Its `copy_files` have nowhere to
    /// come from in a fresh clone, so only its commands matter here.
    pub setup: SetupConfig,
    /// The site to clone from; GitHub, except in tests.
    base: String,
}

impl RepoCheckout {
    pub fn new(remote: RemoteRepo, dest: PathBuf) -> RepoCheckout {
        RepoCheckout {
            remote,
            branch: None,
            token: None,
            dest,
            setup: SetupConfig::default(),
            base: GITHUB.into(),
        }
    }

    /// The plain URL that ends up as `origin`.
    pub fn url(&self) -> String {
        format!("{}/{}.git", self.base, self.remote.full_name())
    }

    /// `git clone` for this checkout, on the `git` the caller found. The token,
    /// if any, is only in the environment.
    pub fn clone_command(&self, mut git: Command) -> Result<Command, String> {
        git.arg("clone");
        if let Some(branch) = &self.branch {
            if !is_branch_name(branch) {
                return Err(format!("{branch} isn't a branch name."));
            }
            git.args(["--branch", branch]);
        }
        git.arg("--").arg(self.url()).arg(&self.dest);
        // Nothing can answer a prompt.
        git.env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "never")
            .stdin(Stdio::null());
        if let Some(token) = &self.token {
            let header = format!("Authorization: {}", token.basic_header());
            let key = format!("http.{}/.extraHeader", self.base);
            // A second entry clears credential helpers, so none stores or
            // replaces the token.
            add_git_config(&mut git, &[(&key, &header), ("credential.helper", "")]);
        }
        Ok(git)
    }

    /// Clone, then run the setup with `setup_env`. Errors name the step and
    /// never contain the token.
    pub fn run(
        &self,
        git: impl Fn() -> Command,
        setup_env: &HashMap<String, String>,
    ) -> Result<(), String> {
        let tok = self.token.as_ref();
        if self.dest.exists() {
            return Err(format!("{} already exists.", self.dest.display()));
        }
        if let Some(parent) = self.dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Couldn't create {}: {e}", parent.display()))?;
        }
        let full_name = self.remote.full_name();
        let out = self
            .clone_command(git())?
            .output()
            .map_err(|e| redact(&format!("Couldn't run git: {e}"), tok))?;
        if !out.status.success() {
            let err = redact(String::from_utf8_lossy(&out.stderr).trim(), tok);
            // A refused token makes git fall back to asking for a username.
            let hint = if err.contains("could not read Username") {
                " GitHub refused the token, or it can't see this repository."
            } else {
                ""
            };
            return Err(if err.is_empty() {
                format!("Cloning {full_name} failed.{hint}")
            } else {
                format!("Cloning {full_name} failed: {err}{hint}")
            });
        }
        let commands_only = SetupConfig {
            copy_files: Vec::new(),
            commands: self.setup.commands.clone(),
        };
        run_steps(&self.dest, &self.dest, &commands_only, setup_env).map_err(|f| {
            redact(
                &format!("Setup step `{}` failed: {}", f.step, f.output),
                tok,
            )
        })
    }
}

/// Add `pairs` to the `GIT_CONFIG_*` entries `git` already carries (the
/// platform adapter can set some, e.g. `core.longpaths`, or trace may have
/// inherited them), rather than replacing them.
fn add_git_config(git: &mut Command, pairs: &[(&str, &str)]) {
    let set = git
        .get_envs()
        .find(|(k, _)| *k == "GIT_CONFIG_COUNT")
        .map(|(_, v)| v.map(|v| v.to_string_lossy().into_owned()));
    let existing = match set {
        Some(v) => v,
        None => std::env::var("GIT_CONFIG_COUNT").ok(),
    };
    let start: usize = existing.and_then(|v| v.trim().parse().ok()).unwrap_or(0);
    for (i, (key, value)) in pairs.iter().enumerate() {
        git.env(format!("GIT_CONFIG_KEY_{}", start + i), key)
            .env(format!("GIT_CONFIG_VALUE_{}", start + i), value);
    }
    git.env("GIT_CONFIG_COUNT", (start + pairs.len()).to_string());
}

/// A branch name safe to pass to git: not a flag, no spaces, control
/// characters or `..`, and not empty.
pub fn is_branch_name(b: &str) -> bool {
    !b.is_empty()
        && b.len() <= 255
        && !b.starts_with('-')
        && !b.contains("..")
        && !b
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || "~^:?*[\\".contains(c))
}

#[cfg(test)]
#[path = "checkout_tests.rs"]
mod tests;
