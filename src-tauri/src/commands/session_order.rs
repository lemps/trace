//! How each list on the Sessions page is sorted, and its manual order, in
//! `session-order.json` beside the sessions themselves (`scratch.json`).
//!
//! A list is a section (keyed by its id) or a tab's unsectioned area (keyed
//! `tab:<tab id>`, `tab:` for the default tab). Each holds a sort mode and, for
//! Manual, the session ids top to bottom. The renderer saves one list at a time,
//! under the file's lock, so saving one section never overwrites another.
//!
//! What's stored is validated on the way in and out: unknown sort modes read as
//! Manual, ids of sessions that no longer exist are dropped, as are lists for
//! sections and tabs that are gone. A session missing from a list's order (new,
//! or moved in) is shown at the top, newest first — that's the renderer's rule.

use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::commands::groups::{self, SessionGroups};
use crate::commands::session;
use crate::helpers::persist::{self, Style};

/// The sorts the Sessions page offers (`domains/sessions/sortSessions.ts`).
const SORTS: &[&str] = &[
    "manual", "status", "creator", "name", "newest", "oldest", "active",
];
/// More ids than any list will hold; a guard against a runaway file, not a limit.
const MAX_IDS: usize = 2000;
const MAX_KEY: usize = 200;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionList {
    #[serde(default = "manual")]
    pub sort: String,
    #[serde(default)]
    pub order: Vec<String>,
}

fn manual() -> String {
    "manual".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionOrder {
    #[serde(default)]
    pub lists: BTreeMap<String, SessionList>,
}

fn order_file() -> PathBuf {
    crate::helpers::trace_dir().join("session-order.json")
}

/// The keys a list may have, given the tabs and sections that exist.
fn known_keys(groups: &SessionGroups) -> HashSet<String> {
    let mut keys: HashSet<String> = groups.sections.iter().map(|s| s.id.clone()).collect();
    keys.insert("tab:".to_string());
    keys.extend(groups.tabs.iter().map(|t| format!("tab:{}", t.id)));
    keys
}

/// One list, made valid: a known sort, and each existing session at most once.
fn clean_list(list: SessionList, sessions: &HashSet<String>) -> SessionList {
    let sort = if SORTS.contains(&list.sort.as_str()) {
        list.sort
    } else {
        manual()
    };
    let mut seen = HashSet::new();
    let order = list
        .order
        .into_iter()
        .filter(|id| sessions.contains(id) && seen.insert(id.clone()))
        .take(MAX_IDS)
        .collect();
    SessionList { sort, order }
}

/// Every list, made valid; lists for sections or tabs that are gone are dropped.
fn clean(order: SessionOrder, sessions: &HashSet<String>, keys: &HashSet<String>) -> SessionOrder {
    let lists = order
        .lists
        .into_iter()
        .filter(|(k, _)| keys.contains(k))
        .map(|(k, l)| (k, clean_list(l, sessions)))
        .collect();
    SessionOrder { lists }
}

fn session_ids() -> HashSet<String> {
    session::load().into_iter().map(|s| s.id).collect()
}

/// Each list's sort and manual order.
#[tauri::command]
pub fn list_session_order() -> Result<SessionOrder, String> {
    let saved: SessionOrder = persist::read_or_default(&order_file())?;
    Ok(clean(saved, &session_ids(), &known_keys(&groups::load())))
}

/// Save one list's sort and order; returns it as stored (validated).
#[tauri::command]
pub fn set_session_list(
    key: String,
    sort: String,
    order: Vec<String>,
) -> Result<SessionList, String> {
    let key = key.trim().to_string();
    if key.is_empty() || key.len() > MAX_KEY {
        return Err("That list has no name.".to_string());
    }
    // Read before taking this file's lock: `persist::update` mustn't nest.
    let sessions = session_ids();
    let keys = known_keys(&groups::load());
    if !keys.contains(&key) {
        return Err("That section no longer exists.".to_string());
    }
    let list = clean_list(SessionList { sort, order }, &sessions);
    persist::update(&order_file(), Style::Compact, |saved: &mut SessionOrder| {
        // Tidy the rest while the file is open, so stale lists don't pile up.
        *saved = clean(std::mem::take(saved), &sessions, &keys);
        saved.lists.insert(key, list.clone());
    })?;
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::{clean, clean_list, known_keys, SessionList, SessionOrder};
    use crate::commands::groups::{SessionGroups, SessionSection, SessionTab};
    use std::collections::HashSet;

    fn ids(list: &[&str]) -> HashSet<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    fn list(sort: &str, order: &[&str]) -> SessionList {
        SessionList {
            sort: sort.into(),
            order: order.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn unknown_ids_and_repeats_are_dropped_and_order_kept() {
        let out = clean_list(list("manual", &["b", "gone", "a", "b"]), &ids(&["a", "b"]));
        assert_eq!(out, list("manual", &["b", "a"]));
    }

    #[test]
    fn an_unknown_sort_reads_as_manual() {
        let out = clean_list(list("by-mood", &[]), &ids(&[]));
        assert_eq!(out.sort, "manual");
        assert_eq!(clean_list(list("status", &[]), &ids(&[])).sort, "status");
    }

    #[test]
    fn lists_for_deleted_sections_and_tabs_are_dropped() {
        let groups = SessionGroups {
            tabs: vec![SessionTab {
                id: "t1".into(),
                name: "Repo".into(),
            }],
            sections: vec![SessionSection {
                id: "s1".into(),
                name: "Spikes".into(),
                tab: None,
                collapsed: false,
            }],
        };
        let keys = known_keys(&groups);
        let mut saved = SessionOrder::default();
        for k in ["tab:", "tab:t1", "s1", "s-gone", "tab:t-gone"] {
            saved.lists.insert(k.into(), list("name", &[]));
        }
        let out = clean(saved, &ids(&[]), &keys);
        let kept: Vec<&str> = out.lists.keys().map(String::as_str).collect();
        assert_eq!(kept, vec!["s1", "tab:", "tab:t1"]);
    }

    #[test]
    fn a_missing_or_partial_file_loads() {
        let empty: SessionOrder = serde_json::from_str("{}").unwrap();
        assert!(empty.lists.is_empty());
        let partial: SessionOrder = serde_json::from_str(r#"{"lists":{"tab:":{}}}"#).unwrap();
        assert_eq!(partial.lists["tab:"], list("manual", &[]));
    }
}
