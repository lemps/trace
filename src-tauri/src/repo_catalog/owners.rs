//! Who a `.worktrees/<dir>` checkout belongs to, so Settings → Worktrees can name
//! it ("Fix login flake", `TRACE-12`) rather than show a 36-character session id.
//!
//! A workspace lives in `.worktrees/<slugified id>` unless it adopted another's
//! dir (`repos.json`'s `dir_overrides`). The lookup reads the sessions file, the
//! repo config and the scheduled prompts once per listing, and every source is
//! best-effort: one that can't be read just names nothing.

use std::collections::HashMap;

use serde::Serialize;

use crate::helpers::slugify;

/// What kind of workspace owns a worktree.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OwnerKind {
    Session,
    Ticket,
    /// A scheduled prompt, which keeps one worktree for all its runs.
    Prompt,
}

/// The workspace a worktree belongs to, as the row shows and opens it.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeOwner {
    pub kind: OwnerKind,
    /// Its workspace id: the session id, the issue key, or the prompt id.
    pub id: String,
    /// What to call it: the session's or prompt's title, or the issue key.
    pub label: String,
}

/// One workspace that may own a worktree, before its dir is worked out.
pub(crate) struct Claim {
    pub kind: OwnerKind,
    pub id: String,
    pub label: String,
}

/// Worktree dir name → its owner.
pub struct Owners(HashMap<String, WorktreeOwner>);

impl Owners {
    /// Read every source once. Never fails: an unreadable source names nothing.
    pub fn load() -> Self {
        let sessions = crate::commands::session::read().unwrap_or_default();
        let prompts = crate::schedule::store::try_prompts().unwrap_or_default();
        let tickets = crate::commands::repos::assigned_workspaces();
        let overrides = crate::commands::repos::dir_overrides();

        // Later claims win a shared dir: a session continuing a prompt's run adopts
        // its dir, and a ticket linked from a session takes the session's over.
        let mut claims: Vec<Claim> = prompts
            .into_iter()
            .map(|p| Claim {
                kind: OwnerKind::Prompt,
                id: p.id,
                label: p.title,
            })
            .collect();
        claims.extend(sessions.into_iter().filter(|s| s.worktree).map(|s| Claim {
            kind: OwnerKind::Session,
            id: s.id,
            label: s.title,
        }));
        claims.extend(
            tickets
                .into_iter()
                .map(|(id, _)| id)
                .filter(|id| crate::activity::looks_like_issue_key(id))
                .map(|id| Claim {
                    kind: OwnerKind::Ticket,
                    label: id.clone(),
                    id,
                }),
        );
        Owners(by_dir(claims, &overrides))
    }

    /// The owner of the worktree dir `dirname`, when trace knows it.
    pub fn of(&self, dirname: &str) -> Option<WorktreeOwner> {
        self.0.get(dirname).cloned()
    }
}

/// Key each claim by the dir its workspace lives in; a blank label falls back to
/// the id, and a later claim on the same dir replaces an earlier one.
pub(crate) fn by_dir(
    claims: Vec<Claim>,
    overrides: &HashMap<String, String>,
) -> HashMap<String, WorktreeOwner> {
    let mut out = HashMap::new();
    for c in claims {
        let dir = overrides
            .get(&c.id)
            .cloned()
            .unwrap_or_else(|| slugify(&c.id));
        if dir.is_empty() {
            continue;
        }
        let label = if c.label.trim().is_empty() {
            c.id.clone()
        } else {
            c.label.trim().to_string()
        };
        out.insert(
            dir,
            WorktreeOwner {
                kind: c.kind,
                id: c.id,
                label,
            },
        );
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claim(kind: OwnerKind, id: &str, label: &str) -> Claim {
        Claim {
            kind,
            id: id.into(),
            label: label.into(),
        }
    }

    #[test]
    fn names_a_session_and_a_ticket_by_their_slugs() {
        let owners = by_dir(
            vec![
                claim(
                    OwnerKind::Session,
                    "3F2A9C1E-0B7D-4C55-9E1A-2B3C4D5E6F70",
                    "Fix login",
                ),
                claim(OwnerKind::Ticket, "TRACE-12", "TRACE-12"),
            ],
            &HashMap::new(),
        );
        assert_eq!(
            owners["3f2a9c1e-0b7d-4c55-9e1a-2b3c4d5e6f70"].label,
            "Fix login"
        );
        assert_eq!(owners["trace-12"].kind, OwnerKind::Ticket);
    }

    #[test]
    fn an_adopted_dir_names_its_adopter() {
        let overrides = HashMap::from([("TRACE-7".to_string(), "abc".to_string())]);
        let owners = by_dir(
            vec![
                claim(OwnerKind::Session, "abc", "Old session"),
                claim(OwnerKind::Ticket, "TRACE-7", "TRACE-7"),
            ],
            &overrides,
        );
        assert_eq!(owners["abc"].id, "TRACE-7");
        assert!(!owners.contains_key("trace-7"));
    }

    #[test]
    fn a_blank_title_falls_back_to_the_id() {
        let owners = by_dir(
            vec![claim(OwnerKind::Prompt, "daily", "  ")],
            &HashMap::new(),
        );
        assert_eq!(owners["daily"].label, "daily");
    }
}
