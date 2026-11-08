//! What the import shows and returns, as the renderer sees it.

use serde::{Deserialize, Serialize};

use crate::repo_catalog::model::SetupConfig;

/// Everything Conductor has that trace could take, read without changing it.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub repos: Vec<RepoPreview>,
    /// Live and archived; the renderer leaves archived ones unticked.
    pub workspaces: Vec<WorkspacePreview>,
    pub defaults: Defaults,
    /// Conductor's custom prompts, as saved prompts trace could add.
    pub prompts: Vec<PromptPreview>,
    /// The `/name`s trace's saved prompts already use, so the renderer can flag
    /// an edited name that's taken before importing.
    pub saved_prompt_names: Vec<String>,
}

/// One Conductor repo and its setup, translated.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoPreview {
    /// Conductor's id for it; what `apply` is given back.
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub remote_url: Option<String>,
    /// The checkout is on disk and is a git repo.
    pub exists: bool,
    /// trace already lists this folder.
    pub already_added: bool,
    pub setup: SetupConfig,
    /// What Conductor had for it that trace doesn't take, each with a reason.
    pub not_imported: Vec<String>,
    /// Translation notes worth reading before importing (a multi-line script
    /// kept as one command, an included folder that can't be copied).
    pub notes: Vec<String>,
}

/// Whether a workspace's conversation can carry on in trace.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceStatus {
    /// Folder and Claude transcript are both there: `--resume` picks it up.
    Resumable,
    /// The folder is there but Claude has deleted the conversation (30 days).
    TranscriptMissing,
    /// The worktree is gone, so there's nothing to adopt.
    FolderMissing,
}

/// One Conductor workspace: a worktree plus the session last active in it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePreview {
    pub id: String,
    pub repo_id: String,
    pub repo_name: String,
    pub repo_root: String,
    pub directory_name: String,
    /// Where it is on disk now.
    pub path: String,
    /// What git says is checked out there (the DB's own branch goes stale).
    pub branch: Option<String>,
    pub archived: bool,
    pub status: WorkspaceStatus,
    /// The session that would carry on: its title, and Claude's id for it.
    pub title: Option<String>,
    pub claude_session_id: Option<String>,
    /// "claude" | "codex".
    pub cli: String,
    /// Other sessions in the workspace, which aren't imported.
    pub other_sessions: usize,
}

/// Conductor's app-wide defaults, mapped onto trace's settings. The renderer
/// applies them: trace keeps these in its own local storage.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Defaults {
    /// e.g. "opus": passed to `--model` as is.
    pub model: Option<String>,
    /// Claude Code's `--permission-mode` value; None for its default.
    pub permission_mode: Option<String>,
    /// One of trace's editor ids ("vscode" | "intellij" | "cursor").
    pub editor: Option<String>,
    /// Conductor's own value when it isn't one trace has.
    pub editor_unknown: Option<String>,
}

/// One of Conductor's custom prompts (or one text several repos share), as the
/// saved prompt it would become.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptPreview {
    /// `<kind>:<first repo's id>`; what `apply` is given back.
    pub key: String,
    /// "general" | "createPr" | "codeReview" | "fixErrors" | "mergeConflicts" | "renameBranch".
    pub kind: String,
    /// The proposed `/name`: unique among trace's prompts and this import's.
    pub name: String,
    pub title: String,
    pub body: String,
    /// The repos (by name) that had this text, in Conductor's order.
    pub repos: Vec<String>,
    /// The name it would have had, when that was taken and a suffix was added.
    pub taken_name: Option<String>,
    /// The saved prompt that already has exactly this text: nothing to import.
    pub existing: Option<String>,
}

/// What the user ticked, by Conductor id, with any setup they edited.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    #[serde(default)]
    pub repos: Vec<RepoChoice>,
    #[serde(default)]
    pub workspaces: Vec<String>,
    #[serde(default)]
    pub prompts: Vec<PromptChoice>,
}

/// A prompt to import, by key, with the name the user gave it (if edited).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PromptChoice {
    pub key: String,
    #[serde(default)]
    pub name: Option<String>,
}

/// A repo to import, and the setup to give it (as edited in the preview).
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoChoice {
    pub id: String,
    pub setup: Option<SetupConfig>,
}

/// One line of the summary.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReportItem {
    pub item: String,
    pub detail: String,
}

/// What the import did and didn't do.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub imported: Vec<ReportItem>,
    pub skipped: Vec<ReportItem>,
}

impl Report {
    pub fn ok(&mut self, item: impl Into<String>, detail: impl Into<String>) {
        self.imported.push(ReportItem {
            item: item.into(),
            detail: detail.into(),
        });
    }

    pub fn skip(&mut self, item: impl Into<String>, detail: impl Into<String>) {
        self.skipped.push(ReportItem {
            item: item.into(),
            detail: detail.into(),
        });
    }
}
