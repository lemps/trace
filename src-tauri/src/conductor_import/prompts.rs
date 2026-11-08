//! Conductor's custom prompts, offered as trace saved prompts.
//!
//! Conductor keeps up to six per repo, in the `repos` table's `custom_prompt_*`
//! columns. Five are commands (create PR, code review, …); `general` is the repo's
//! context, which Conductor appended to every chat. trace has no such layer, so
//! it becomes a prompt to send by hand (`/<repo>-context`).
//!
//! Naming is pure ([`plan`]) and never overwrites:
//! - the same text in several repos is one prompt;
//! - a kind with different texts in different repos gets the repo in each name
//!   (`app-pr`, `web-pr`);
//! - a name trace already uses gets a numeric suffix (`pr-2`);
//! - a text trace already has saved, under any name, is shown as already there.

use super::db::Row;
use super::model::PromptPreview;
use crate::saved_prompts::{SavedPrompt, MAX_NAME};

/// One kind of Conductor custom prompt.
pub struct Kind {
    /// The `repos` column it's read from.
    pub column: &'static str,
    /// The renderer's id for it.
    pub id: &'static str,
    /// What Conductor calls it, for the summary.
    pub label: &'static str,
    /// The `/name` it's offered as (after the repo, when per repo).
    slug: &'static str,
    title: &'static str,
}

/// Every kind, in the order the preview lists them.
pub const KINDS: &[Kind] = &[
    Kind {
        column: "custom_prompt_create_pr",
        id: "createPr",
        label: "create PR",
        slug: "pr",
        title: "Create a PR",
    },
    Kind {
        column: "custom_prompt_code_review",
        id: "codeReview",
        label: "code review",
        slug: "review",
        title: "Review the code",
    },
    Kind {
        column: "custom_prompt_fix_errors",
        id: "fixErrors",
        label: "fix errors",
        slug: "fix-errors",
        title: "Fix errors",
    },
    Kind {
        column: "custom_prompt_resolve_merge_conflicts",
        id: "mergeConflicts",
        label: "merge conflicts",
        slug: "resolve-conflicts",
        title: "Resolve merge conflicts",
    },
    Kind {
        column: "custom_prompt_rename_branch",
        id: "renameBranch",
        label: "rename branch",
        slug: "rename-branch",
        title: "Rename the branch",
    },
    Kind {
        column: "custom_prompt_general",
        id: "general",
        label: "general",
        slug: "context",
        title: "Repo context",
    },
];

/// The kind with renderer id `id`.
pub fn kind(id: &str) -> Option<&'static Kind> {
    KINDS.iter().find(|k| k.id == id)
}

/// One text and the repos (`(id, name)`) that have it, for one kind.
struct Group {
    body: String,
    repos: Vec<(String, String)>,
}

/// Every non-empty custom prompt in `rows` (visible repos, in Conductor's order),
/// named against `existing`, trace's saved prompts.
pub fn plan(rows: &[&Row], existing: &[SavedPrompt]) -> Vec<PromptPreview> {
    let mut taken: Vec<String> = existing.iter().map(|p| p.name.clone()).collect();
    let mut out = Vec::new();
    for kind in KINDS {
        let groups = groups(rows, kind.column);
        let one_text = groups.len() == 1;
        for group in groups {
            // `general` is always one repo's context, unless every repo shares it.
            let per_repo = if kind.id == "general" {
                !(one_text && group.repos.len() > 1)
            } else {
                !one_text
            };
            let (first_id, first_name) = &group.repos[0];
            let names: Vec<String> = group.repos.iter().map(|(_, n)| n.clone()).collect();
            let (base, title) = if per_repo {
                let room = MAX_NAME - kind.slug.len() - 1;
                let base = format!("{}-{}", repo_slug(first_name, room), kind.slug);
                let title = if kind.id == "general" {
                    format!("Context for {}", names.join(", "))
                } else {
                    format!("{} ({})", kind.title, names.join(", "))
                };
                (base, title)
            } else {
                (kind.slug.to_string(), kind.title.to_string())
            };
            let existing = existing
                .iter()
                .find(|p| p.body.trim() == group.body)
                .map(|p| p.name.clone());
            let name = if existing.is_some() {
                base.clone()
            } else {
                let name = unique(&base, &taken);
                taken.push(name.clone());
                name
            };
            out.push(PromptPreview {
                key: format!("{}:{first_id}", kind.id),
                kind: kind.id.to_string(),
                taken_name: (name != base).then_some(base),
                name,
                title,
                body: group.body,
                repos: names,
                existing,
            });
        }
    }
    out
}

/// The texts in `column`, trimmed, each with the repos that have it.
fn groups(rows: &[&Row], column: &str) -> Vec<Group> {
    let mut groups: Vec<Group> = Vec::new();
    for row in rows {
        let Some(body) = row.get(column).map(|b| b.trim()).filter(|b| !b.is_empty()) else {
            continue;
        };
        let Some(id) = row.get("id") else { continue };
        let repo = (id.clone(), repo_name(row));
        match groups.iter_mut().find(|g| g.body == body) {
            Some(g) => g.repos.push(repo),
            None => groups.push(Group {
                body: body.to_string(),
                repos: vec![repo],
            }),
        }
    }
    groups
}

fn repo_name(row: &Row) -> String {
    row.get("name")
        .cloned()
        .or_else(|| {
            row.get("root_path")
                .map(|p| crate::platform::paths::basename(p))
        })
        .unwrap_or_else(|| "repo".to_string())
}

/// A repo name as a name prefix: lowercase letters and digits, runs of anything
/// else as one `-`, at most `max` long; `repo` when nothing is left.
pub fn repo_slug(name: &str, max: usize) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug: String = slug.chars().take(max).collect();
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() {
        "repo".to_string()
    } else {
        slug.to_string()
    }
}

/// `base`, or `base-2`, `base-3`, … whichever `taken` doesn't have, within
/// [`MAX_NAME`].
pub fn unique(base: &str, taken: &[String]) -> String {
    if !taken.iter().any(|t| t == base) {
        return base.to_string();
    }
    (2..)
        .map(|n| {
            let suffix = format!("-{n}");
            let stem: String = base.chars().take(MAX_NAME - suffix.len()).collect();
            format!("{}{suffix}", stem.trim_end_matches('-'))
        })
        .find(|name| !taken.contains(name))
        .unwrap_or_else(|| base.to_string())
}
