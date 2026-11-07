//! Thin `#[tauri::command]` wrappers. Validation + delegation only — business
//! logic lives in `jira/`, `claude/`, and `git`.

pub mod activity;
pub mod agent;
pub mod agent_chat;
pub mod agent_tools;
pub mod cleanup;
pub mod diff;
pub mod editor;
pub mod files;
pub mod github;
pub mod groups;
pub mod interrupted;
pub mod issues;
pub mod orchestrator;
pub mod pr;
pub mod pr_watch;
pub mod providers;
pub mod repo_guard;
pub mod repo_setup;
pub mod repos;
pub mod rich_output;
pub mod schedules;
pub mod session;
pub mod session_agents;
pub mod session_cwd;
pub mod session_folder;
pub mod session_link;
pub mod session_order;
pub mod session_origin;
pub mod snapshot;
pub mod sound;
pub mod tests;
pub mod transcript;
pub mod update;
pub mod workspace;
pub mod worktrees;
