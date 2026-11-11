//! The rule list on disk (`permissions.json`), and the "always allow" answers a run
//! collects.
//!
//! A missing file reads as the built-ins ([`builtins`]). The first save or delete
//! writes the whole list out, so a built-in the user edits or deletes stays that way:
//! they're a starting point, not a layer underneath. (Same contract as
//! `saved_prompts`, for the same reason.)

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use super::model::{Action, Rule, RuleDraft};
use crate::helpers::persist::{self, Style};

/// A guard against a runaway list, not a limit anyone should meet.
const MAX_RULES: usize = 500;
const MAX_TOOL: usize = 200;
const MAX_NOTE: usize = 200;

/// The file: an object, so fields can be added later without breaking older builds.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct RulesFile {
    #[serde(default)]
    rules: Vec<Rule>,
}

fn rules_file() -> PathBuf {
    crate::helpers::trace_dir().join("permissions.json")
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn builtin(id: &str, tool: &str, action: Action, note: &str, now: i64) -> Rule {
    Rule {
        id: id.to_string(),
        tool: tool.to_string(),
        action,
        repo: None,
        note: Some(note.to_string()),
        created_at: now,
    }
}

/// What a new install starts with: a few commands that only look, and one example of
/// a rule that refuses. Ordinary rules once saved — editable and deletable like any
/// other.
pub fn builtins(now: i64) -> Vec<Rule> {
    vec![
        builtin(
            "builtin-git-read",
            "Bash(git status*)",
            Action::Allow,
            "Reads the working tree; changes nothing.",
            now,
        ),
        builtin(
            "builtin-git-diff",
            "Bash(git diff*)",
            Action::Allow,
            "Reads the working tree; changes nothing.",
            now,
        ),
        builtin(
            "builtin-git-log",
            "Bash(git log*)",
            Action::Allow,
            "Reads history; changes nothing.",
            now,
        ),
        builtin(
            "builtin-rm-root",
            "Bash(rm -rf /*)",
            Action::Deny,
            "Never, whatever the agent is doing.",
            now,
        ),
    ]
}

/// A draft checked and trimmed.
fn clean(draft: &RuleDraft) -> Result<(String, Option<String>, Option<String>), String> {
    let tool = draft.tool.trim().to_string();
    if tool.is_empty() {
        return Err("Name the tool the rule is about.".to_string());
    }
    if tool.chars().count() > MAX_TOOL {
        return Err(format!("Keep the rule to {MAX_TOOL} characters."));
    }
    // `Tool(` with no `)` is a half-typed rule that would match nothing.
    if tool.contains('(') && !tool.ends_with(')') {
        return Err("Close the rule's parentheses, as in Bash(git status*).".to_string());
    }
    let repo = draft
        .repo
        .as_deref()
        .map(str::trim)
        .filter(|r| !r.is_empty())
        .map(str::to_string);
    let note = draft
        .note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|n| n.chars().take(MAX_NOTE).collect());
    Ok((tool, repo, note))
}

/// Apply a save to `rules`: add (no id) or replace (an id), keeping the list's order.
pub fn apply_save(
    rules: &mut Vec<Rule>,
    draft: &RuleDraft,
    new_id: impl FnOnce() -> String,
    now: i64,
) -> Result<Rule, String> {
    let (tool, repo, note) = clean(draft)?;
    match draft.id.as_deref() {
        Some(id) => {
            let Some(rule) = rules.iter_mut().find(|r| r.id == id) else {
                return Err("That rule no longer exists.".to_string());
            };
            rule.tool = tool;
            rule.action = draft.action;
            rule.repo = repo;
            rule.note = note;
            Ok(rule.clone())
        }
        None => {
            if rules.len() >= MAX_RULES {
                return Err(format!("trace keeps at most {MAX_RULES} permission rules."));
            }
            let rule = Rule {
                id: new_id(),
                tool,
                action: draft.action,
                repo,
                note,
                created_at: now,
            };
            rules.push(rule.clone());
            Ok(rule)
        }
    }
}

/// The saved rules at `path`; the built-ins when there's no file yet.
pub fn list_at(path: &Path) -> Result<Vec<Rule>, String> {
    Ok(match persist::read_json::<RulesFile>(path)? {
        Some(file) => file.rules,
        None => builtins(now_ms()),
    })
}

pub fn save_at(path: &Path, draft: &RuleDraft) -> Result<Rule, String> {
    let now = now_ms();
    let init = || RulesFile {
        rules: builtins(now),
    };
    persist::update_or(path, Style::Pretty, init, |file: &mut RulesFile| {
        apply_save(&mut file.rules, draft, crate::helpers::new_id, now)
    })?
}

pub fn delete_at(path: &Path, id: &str) -> Result<(), String> {
    let now = now_ms();
    let init = || RulesFile {
        rules: builtins(now),
    };
    persist::update_or(path, Style::Pretty, init, |file: &mut RulesFile| {
        file.rules.retain(|r| r.id != id);
    })
}

/// Every saved rule.
pub fn list() -> Result<Vec<Rule>, String> {
    list_at(&rules_file())
}

pub fn save(draft: &RuleDraft) -> Result<Rule, String> {
    save_at(&rules_file(), draft)
}

pub fn delete(id: &str) -> Result<(), String> {
    delete_at(&rules_file(), id)
}

/// The "always allow" answers each live agent has collected, by workspace. Kept in
/// memory on purpose: they last as long as the run that granted them, and a restart
/// starts from the saved list again.
static SESSION: RwLock<Option<HashMap<String, Vec<Rule>>>> = RwLock::new(None);

/// The rules granted during `workspace_id`'s current run.
pub fn session_rules(workspace_id: &str) -> Vec<Rule> {
    SESSION
        .read()
        .ok()
        .and_then(|held| held.as_ref()?.get(workspace_id).cloned())
        .unwrap_or_default()
}

/// Remember an "always allow" for the rest of this run.
pub fn grant(workspace_id: &str, rule: Rule) {
    if let Ok(mut held) = SESSION.write() {
        held.get_or_insert_with(HashMap::new)
            .entry(workspace_id.to_string())
            .or_default()
            .push(rule);
    }
}

/// Forget a run's grants: it stopped, so its permissions stop with it.
pub fn forget(workspace_id: &str) {
    if let Ok(mut held) = SESSION.write() {
        if let Some(map) = held.as_mut() {
            map.remove(workspace_id);
        }
    }
}
