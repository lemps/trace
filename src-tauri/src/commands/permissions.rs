//! trace's permission rules (`permissions/`), managed in Settings. Thin wrappers only.

use crate::permissions::{store, Rule, RuleDraft};

/// Every rule, in the order added (the built-ins on a new install).
#[tauri::command]
pub fn list_permission_rules() -> Result<Vec<Rule>, String> {
    store::list()
}

/// Add a rule (no id) or replace one (an id); returns it as stored.
#[tauri::command]
pub fn save_permission_rule(rule: RuleDraft) -> Result<Rule, String> {
    store::save(&rule)
}

/// Delete a rule by id.
#[tauri::command]
pub fn delete_permission_rule(id: String) -> Result<(), String> {
    store::delete(&id)
}
