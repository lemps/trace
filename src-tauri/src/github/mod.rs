//! GitHub through the user's `gh` CLI (so their existing `gh auth` applies — no
//! in-app OAuth, and trace holds no GitHub token): the pull requests a
//! workspace's agent raised, and the Integrations page's repo browser.
//!
//! - `account`, `repo_list`, `clone`: who `gh` is signed in as, an owner's repos,
//!   and checking one out for agents (`commands/github.rs`).
//! - `links`: *which* PRs belong to a workspace — its branch's PRs plus any PR
//!   URL the conversation mentions (agents print the URL after `gh pr create`,
//!   but it scrolls off the TUI's screen, which is the whole problem).
//! - `thread`: one PR's state + discussion (comments, reviews, inline threads)
//!   with edit timestamps, so the rail can show comments that change in place.

pub mod account;
mod checks;
pub mod clone;
mod gh;
pub mod links;
pub mod repo_list;
pub mod repo_prs;
pub mod thread;
mod thread_parse;
