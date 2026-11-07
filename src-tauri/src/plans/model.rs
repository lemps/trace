//! The Plan tab's document model, mirrored by `src/domains/plans/types.ts`.
//!
//! Every plan an agent produces, whatever produced it, becomes a [`PlanDoc`]:
//! Claude's plan mode (`capture`), a document the agent published (`trace-render`
//! or the `publish_document` tool), or an HTML card saved by an older trace
//! (`legacy`). Documents of one `series` are versions of one document: a new plan
//! from the same source is the next version, and the older ones are kept.

use serde::{Deserialize, Serialize};

use crate::agent_session::journal::PlanItem;

/// Where a document came from. Shown quietly beside it in the list.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlanSource {
    /// Claude left plan mode with it (ExitPlanMode, or its plan file).
    PlanMode,
    /// The agent published it (`trace-render`, `publish_document`), or an older
    /// trace's HTML tab saved it.
    Published,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlanFormat {
    Markdown,
    /// Rendered only in a sandboxed iframe: never trusted markup.
    Html,
}

/// One version of a document.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanDoc {
    pub id: String,
    /// Versions of one document share it ("plan-mode", "published:<title>").
    pub series: String,
    pub title: String,
    pub source: PlanSource,
    pub format: PlanFormat,
    pub body: String,
    /// Unix milliseconds.
    pub created_at: u64,
    /// 1, 2, … within its series.
    pub version: u32,
}

/// The agent's live task list (TodoWrite, the journal's `plan` rows). Not a
/// document: it changes in place and has no versions.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskList {
    pub items: Vec<PlanItem>,
    pub updated_at: u64,
}

/// A workspace's file on disk. `refs` are the capture keys already turned into
/// documents (a tool call's id, an old card's id), kept apart from the documents so
/// a rescan of a transcript, or a version trimmed away, never comes back.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanFile {
    #[serde(default)]
    pub docs: Vec<PlanDoc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tasks: Option<TaskList>,
    #[serde(default)]
    pub refs: Vec<String>,
}

/// What the renderer gets for a workspace: everything but the capture keys.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanState {
    pub docs: Vec<PlanDoc>,
    pub tasks: Option<TaskList>,
}

/// A document about to be recorded. `series` and `version` are worked out by
/// `store::add`; `reference` dedupes a capture seen twice.
#[derive(Clone, Debug, PartialEq)]
pub struct NewDoc {
    pub series: String,
    pub title: String,
    pub source: PlanSource,
    pub format: PlanFormat,
    pub body: String,
    pub reference: Option<String>,
}

/// A title for a Markdown plan: its first heading, else `fallback`.
pub fn markdown_title(body: &str, fallback: &str) -> String {
    let heading = body
        .lines()
        .map(str::trim)
        .find(|l| l.starts_with('#'))
        .map(|l| plain(l.trim_start_matches('#')))
        .filter(|t| !t.is_empty());
    heading.unwrap_or_else(|| fallback.to_string())
}

/// A heading's text without its inline Markdown marks (`code`, **bold**).
fn plain(heading: &str) -> String {
    heading
        .chars()
        .filter(|c| !matches!(c, '`' | '*'))
        .collect::<String>()
        .trim()
        .to_string()
}

/// A title for an HTML document: its `<title>`, else `fallback`.
pub fn html_title(body: &str, fallback: &str) -> String {
    let lower = body.to_ascii_lowercase();
    let found = lower.find("<title").and_then(|start| {
        let open = start + lower[start..].find('>')? + 1;
        let close = open + lower[open..].find("</title")?;
        // ASCII lowercasing keeps byte offsets, so they index `body` too.
        body.get(open..close).map(|t| t.trim().to_string())
    });
    found
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

/// The series a published document of `title` joins: same title, same document.
pub fn published_series(format: PlanFormat, title: &str) -> String {
    let prefix = match format {
        PlanFormat::Markdown => "published",
        PlanFormat::Html => "html",
    };
    format!("{prefix}:{}", title.trim().to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_come_from_the_first_heading_or_the_html_title() {
        assert_eq!(
            markdown_title("intro\n## Plan: ship it\n# Later", "Plan"),
            "Plan: ship it"
        );
        assert_eq!(markdown_title("no heading", "Plan"), "Plan");
        assert_eq!(
            markdown_title("# Add `shout(name)` **now**", "Plan"),
            "Add shout(name) now"
        );
        assert_eq!(markdown_title("#\n", "Plan"), "Plan");
        assert_eq!(
            html_title("<html><TITLE> Report </TITLE>", "HTML"),
            "Report"
        );
        assert_eq!(html_title("<p>none</p>", "HTML"), "HTML");
        assert_eq!(html_title("<title>unclosed", "HTML"), "HTML");
    }

    #[test]
    fn published_documents_of_one_title_share_a_series() {
        assert_eq!(
            published_series(PlanFormat::Markdown, " Rollout Plan "),
            published_series(PlanFormat::Markdown, "rollout plan")
        );
        assert_ne!(
            published_series(PlanFormat::Markdown, "x"),
            published_series(PlanFormat::Html, "x")
        );
    }
}
