//! Importing what the user ticked in the preview.
//!
//! The selection is only ids (plus any setup the user edited): everything else
//! is read again from Conductor here, so the renderer can't hand in a path.

use super::model::{Preview, RepoPreview, Report, Selection, WorkspaceStatus};

/// Import `sel` from a fresh `preview`, and say what happened to each item.
pub fn apply(preview: &Preview, sel: &Selection) -> Report {
    let mut report = Report::default();
    for choice in &sel.repos {
        let Some(repo) = preview.repos.iter().find(|r| r.id == choice.id) else {
            continue;
        };
        import_repo(repo, choice.setup.clone(), &mut report);
    }
    for id in &sel.workspaces {
        let Some(ws) = preview.workspaces.iter().find(|w| &w.id == id) else {
            continue;
        };
        let name = format!("{}/{}", ws.repo_name, ws.directory_name);
        if ws.status == WorkspaceStatus::FolderMissing {
            report.skip(name, "Its folder isn't there any more.");
            continue;
        }
        // A workspace needs its repo in trace, ticked or not.
        if !crate::commands::repos::all_repos().contains(&ws.repo_root) {
            if let Err(e) = crate::commands::repos::add_repo(ws.repo_root.clone()) {
                report.skip(name, format!("Couldn't add its repository: {e}"));
                continue;
            }
            report.ok(&ws.repo_name, "Added, for the workspace in it.");
        }
        match super::adopt::adopt(ws) {
            Ok(done) if done.resumes => report.ok(
                name,
                format!("Moved to {}. Its conversation carries on.", done.path),
            ),
            Ok(done) => report.ok(
                name,
                format!(
                    "Moved to {}. Claude no longer has its conversation, so it starts fresh.",
                    done.path
                ),
            ),
            Err(e) => report.skip(name, e),
        }
        if ws.other_sessions > 0 {
            report.skip(
                format!("{} other chats in {}", ws.other_sessions, ws.directory_name),
                "Only the workspace's latest chat is imported.",
            );
        }
    }
    let archived = preview.workspaces.iter().filter(|w| w.archived).count();
    let unticked = archived
        - preview
            .workspaces
            .iter()
            .filter(|w| w.archived && sel.workspaces.contains(&w.id))
            .count();
    if unticked > 0 {
        report.skip(
            format!("{unticked} archived workspaces"),
            "Archived in Conductor, so left there.",
        );
    }
    report.skip(
        "Conductor's environment variables and API token",
        "They hold credentials, so they're never read. Set up your Bedrock or AWS access in trace again.",
    );
    report.skip(
        "Chat history",
        "trace shows Claude's own transcript, so Conductor's copy of the messages isn't imported.",
    );
    report
}

fn import_repo(
    repo: &RepoPreview,
    edited: Option<crate::repo_catalog::model::SetupConfig>,
    report: &mut Report,
) {
    if !repo.exists {
        report.skip(
            &repo.name,
            format!(
                "{} isn't a git repository on this computer.",
                repo.root_path
            ),
        );
        return;
    }
    if !repo.already_added {
        if let Err(e) = crate::commands::repos::add_repo(repo.root_path.clone()) {
            report.skip(&repo.name, e);
            return;
        }
    }
    let setup = edited.unwrap_or_else(|| repo.setup.clone());
    let current = crate::repo_catalog::details(std::slice::from_ref(&repo.root_path))
        .into_iter()
        .next()
        .map(|d| d.setup)
        .unwrap_or_default();
    let what = if repo.already_added {
        "Already in trace"
    } else {
        "Added"
    };
    if setup.is_empty() {
        report.ok(
            &repo.name,
            format!("{what}. Conductor had no setup for it."),
        );
    } else if !current.is_empty() {
        report.ok(
            &repo.name,
            format!("{what}. Kept the setup trace already had."),
        );
    } else {
        match crate::repo_catalog::set_setup(&repo.root_path, setup) {
            Ok(_) => report.ok(&repo.name, format!("{what}, with its setup.")),
            Err(e) => report.skip(format!("{} setup", repo.name), e),
        }
    }
    for line in &repo.not_imported {
        report.skip(&repo.name, line);
    }
}
