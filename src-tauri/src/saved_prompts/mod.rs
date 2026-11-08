//! Saved prompts: reusable messages ("Review my diff") the composer offers as
//! `/name` in its slash menu, kept in `saved-prompts.json` in the app config dir.
//!
//! They live here rather than in the renderer so other producers can use them too
//! (an importer bringing Conductor's custom prompts, agents over trace's tools).
//!
//! A missing file reads as the built-ins ([`builtins`]). The first save or delete
//! writes the whole list out, so a built-in the user edits or deletes stays that way:
//! they're only a starting point, not a layer underneath.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

#[cfg(test)]
mod tests;

/// Longest `/name`; long enough for `review-security`, short enough for the menu.
pub const MAX_NAME: usize = 40;
const MAX_TITLE: usize = 120;
/// A guard against a runaway paste, not a limit anyone should meet.
const MAX_BODY: usize = 50_000;
const MAX_PROMPTS: usize = 500;

/// One saved prompt. `name` is the slug typed as `/name`; `title` is what the menu
/// and Settings show; `body` is what fills the composer. Times are ms since the epoch.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedPrompt {
    pub id: String,
    pub name: String,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

/// What the renderer sends to save: no `id` adds a prompt, an `id` replaces one.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptDraft {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub title: String,
    pub body: String,
}

/// The file: an object, so fields can be added later without breaking older builds.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SavedPromptsFile {
    #[serde(default)]
    prompts: Vec<SavedPrompt>,
}

fn prompts_file() -> PathBuf {
    crate::helpers::trace_dir().join("saved-prompts.json")
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn builtin(id: &str, name: &str, title: &str, body: &str, now: i64) -> SavedPrompt {
    SavedPrompt {
        id: id.to_string(),
        name: name.to_string(),
        title: title.to_string(),
        body: body.to_string(),
        created_at: now,
        updated_at: now,
    }
}

/// The prompts a new install starts with. Ordinary prompts once saved: editable and
/// deletable like any other.
pub fn builtins(now: i64) -> Vec<SavedPrompt> {
    vec![
        builtin(
            "builtin-review-diff",
            "review-diff",
            "Review my changes",
            "Review my uncommitted changes (the working tree's diff and any untracked files) for \
             bugs and risks. For each finding, give the file and line, how serious it is and a \
             suggested fix. Don't change any code yet.",
            now,
        ),
        builtin(
            "builtin-pr",
            "pr",
            "Commit, push and raise a PR",
            "Commit this work with a clear message, push the branch and raise a pull request for \
             it. Give the PR a clear title and a description that says what changed, why, and \
             how it was tested.",
            now,
        ),
    ]
}

/// A name as typed (`/Review-PR `) made into its slug (`review-pr`), or why it can't
/// be one. Letters, digits, `-` and `_`, starting with a letter or digit: no spaces
/// (the slash menu ends a command at one) and no `:` (taken by `/saved:name`).
pub fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim().trim_start_matches('/').to_lowercase();
    if name.is_empty() {
        return Err("Give the prompt a name to type after /.".to_string());
    }
    if name.chars().count() > MAX_NAME {
        return Err(format!("Keep the name to {MAX_NAME} characters."));
    }
    let ok_char = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_';
    let starts_ok = name
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric());
    if !starts_ok || !name.chars().all(ok_char) {
        return Err(
            "Use letters, digits, - and _ in the name, starting with a letter or digit."
                .to_string(),
        );
    }
    Ok(name)
}

/// A draft checked and trimmed: `(name, title, body)`.
fn clean_draft(draft: &PromptDraft) -> Result<(String, String, String), String> {
    let name = clean_name(&draft.name)?;
    let title = draft.title.trim().to_string();
    let body = draft.body.trim().to_string();
    if body.is_empty() {
        return Err("The prompt has no text.".to_string());
    }
    if body.len() > MAX_BODY {
        return Err("That prompt is too long to save.".to_string());
    }
    // No title is fine: the name stands in for it.
    let title = if title.is_empty() {
        name.clone()
    } else {
        title.chars().take(MAX_TITLE).collect()
    };
    Ok((name, title, body))
}

/// Apply a save to `prompts`: add (no id) or replace (an id), keeping the list's
/// order. Names are unique; the returned prompt is the one stored.
fn apply_save(
    prompts: &mut Vec<SavedPrompt>,
    draft: &PromptDraft,
    new_id: impl FnOnce() -> String,
    now: i64,
) -> Result<SavedPrompt, String> {
    let (name, title, body) = clean_draft(draft)?;
    let id = draft.id.as_deref();
    if prompts
        .iter()
        .any(|p| p.name == name && Some(p.id.as_str()) != id)
    {
        return Err(format!("There's already a saved prompt called /{name}."));
    }
    let saved = match id {
        Some(id) => {
            let Some(p) = prompts.iter_mut().find(|p| p.id == id) else {
                return Err("That saved prompt no longer exists.".to_string());
            };
            p.name = name;
            p.title = title;
            p.body = body;
            p.updated_at = now;
            p.clone()
        }
        None => {
            if prompts.len() >= MAX_PROMPTS {
                return Err(format!("trace keeps at most {MAX_PROMPTS} saved prompts."));
            }
            let p = SavedPrompt {
                id: new_id(),
                name,
                title,
                body,
                created_at: now,
                updated_at: now,
            };
            prompts.push(p.clone());
            p
        }
    };
    Ok(saved)
}

/// The saved prompts at `path`, in the order they were added; the built-ins when
/// there's no file yet.
pub fn list_at(path: &Path) -> Result<Vec<SavedPrompt>, String> {
    Ok(match persist::read_json::<SavedPromptsFile>(path)? {
        Some(file) => file.prompts,
        None => builtins(now_ms()),
    })
}

/// Add or replace one prompt at `path`, under its lock.
pub fn save_at(path: &Path, draft: &PromptDraft) -> Result<SavedPrompt, String> {
    let now = now_ms();
    let init = || SavedPromptsFile {
        prompts: builtins(now),
    };
    persist::update_or(path, Style::Pretty, init, |file: &mut SavedPromptsFile| {
        apply_save(&mut file.prompts, draft, crate::helpers::new_id, now)
    })?
}

/// Add several new prompts at `path` in one write under its lock, each checked as
/// [`save_at`] checks one. It only ever adds: a draft with an `id` is refused rather
/// than replacing that prompt, as is a name already taken. One that fails doesn't stop
/// the rest; the result has one entry per draft, in order.
pub fn add_all_at(
    path: &Path,
    drafts: &[PromptDraft],
) -> Result<Vec<Result<SavedPrompt, String>>, String> {
    let now = now_ms();
    let init = || SavedPromptsFile {
        prompts: builtins(now),
    };
    persist::update_or(path, Style::Pretty, init, |file: &mut SavedPromptsFile| {
        drafts
            .iter()
            .map(|draft| {
                if draft.id.is_some() {
                    return Err("Only new prompts can be added here.".to_string());
                }
                apply_save(&mut file.prompts, draft, crate::helpers::new_id, now)
            })
            .collect()
    })
}

/// Remove one prompt at `path`. One that's already gone is fine.
pub fn delete_at(path: &Path, id: &str) -> Result<(), String> {
    let now = now_ms();
    let init = || SavedPromptsFile {
        prompts: builtins(now),
    };
    persist::update_or(path, Style::Pretty, init, |file: &mut SavedPromptsFile| {
        file.prompts.retain(|p| p.id != id);
    })
}

/// Every saved prompt, from the app config dir.
pub fn list() -> Result<Vec<SavedPrompt>, String> {
    list_at(&prompts_file())
}

/// Save one prompt in the app config dir.
pub fn save(draft: &PromptDraft) -> Result<SavedPrompt, String> {
    save_at(&prompts_file(), draft)
}

/// Add several new prompts in the app config dir; see [`add_all_at`].
pub fn add_all(drafts: &[PromptDraft]) -> Result<Vec<Result<SavedPrompt, String>>, String> {
    add_all_at(&prompts_file(), drafts)
}

/// Delete one prompt from the app config dir.
pub fn delete(id: &str) -> Result<(), String> {
    delete_at(&prompts_file(), id)
}
