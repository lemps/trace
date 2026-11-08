//! Saved prompts (`saved_prompts/`): the composer's `/name` shortcuts, managed in
//! Settings. Thin wrappers only.

use crate::saved_prompts::{self, PromptDraft, SavedPrompt};

/// Every saved prompt, in the order added (the built-ins on a new install).
#[tauri::command]
pub fn list_saved_prompts() -> Result<Vec<SavedPrompt>, String> {
    saved_prompts::list()
}

/// Add a prompt (no id) or replace one (an id); returns it as stored.
#[tauri::command]
pub fn save_saved_prompt(prompt: PromptDraft) -> Result<SavedPrompt, String> {
    saved_prompts::save(&prompt)
}

/// Delete a prompt by id.
#[tauri::command]
pub fn delete_saved_prompt(id: String) -> Result<(), String> {
    saved_prompts::delete(&id)
}
