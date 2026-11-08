//! The preview end to end, on a fixture database and temp git repos; and, when
//! asked for (`--ignored`), on this computer's real Conductor data, read-only.

use std::path::Path;

use rusqlite::Connection;

use super::model::WorkspaceStatus;
use super::*;

fn git(dir: &Path, args: &[&str]) {
    let out = crate::claude::discovery::command("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn previews_repos_workspaces_and_defaults() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path().join("home");
    let root = tmp.path().join("app");
    std::fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "-q", "-b", "main"]);
    git(
        &root,
        &[
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "i",
        ],
    );
    let live = home.join("conductor/workspaces/app/lima");
    git(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "me/real-branch",
            &live.to_string_lossy(),
        ],
    );
    std::fs::write(
        root.join("conductor.json"),
        r#"{"scripts":{"setup":"pnpm i","run":"pnpm dev"}}"#,
    )
    .unwrap();

    let db = tmp.path().join("conductor.db");
    let conn = Connection::open(&db).unwrap();
    conn.execute_batch(&format!(
        "CREATE TABLE repos (id TEXT, name TEXT, root_path TEXT, storage_version INTEGER, hidden INTEGER,
            custom_prompt_general TEXT);
         CREATE TABLE workspaces (id TEXT, repository_id TEXT, directory_name TEXT, branch TEXT,
            state TEXT, active_session_id TEXT);
         CREATE TABLE sessions (id TEXT, workspace_id TEXT, claude_session_id TEXT, title TEXT,
            permission_mode TEXT, is_hidden INTEGER, updated_at TEXT);
         CREATE TABLE settings (key TEXT, value TEXT);
         INSERT INTO repos VALUES ('r1', 'app', '{root}', 3, 0, 'Be terse'),
            ('r2', 'gone', '/nowhere/gone', 3, 0, NULL), ('r3', 'hid', '/x', 3, 1, NULL);
         INSERT INTO workspaces VALUES ('w1', 'r1', 'lima', 'stale/branch', 'ready', 's1'),
            ('w2', 'r1', 'oslo', 'b', 'archived', NULL);
         INSERT INTO sessions VALUES ('s1', 'w1', 'c-not-on-disk', 'Fix login', 'plan', 0, '2'),
            ('s2', 'w1', 'c2', 'Old', 'plan', 0, '1'),
            ('s3', 'w2', 'c3', 'Older', 'acceptEdits', 0, '0');
         INSERT INTO settings VALUES ('default_model', 'opus'), ('default_open_in', 'intellij'),
            ('claude_env_vars', 'SECRET');",
        root = root.to_string_lossy()
    ))
    .unwrap();
    drop(conn);

    let snap = db::read(&db).unwrap();
    let p = preview_of(&snap, &home, &[], &[]);

    assert_eq!(p.repos.len(), 2, "hidden repos are left out");
    let app = &p.repos[0];
    assert!(app.exists && !app.already_added);
    assert_eq!(app.setup.commands, vec!["pnpm i"]);
    assert_eq!(app.not_imported.len(), 1, "{:?}", app.not_imported);
    assert_eq!(p.prompts.len(), 1);
    assert_eq!(p.prompts[0].name, "app-context");
    assert!(!p.repos[1].exists);

    assert_eq!(p.workspaces.len(), 2);
    let lima = &p.workspaces[0];
    assert!(!lima.archived);
    assert_eq!(
        lima.branch.as_deref(),
        Some("me/real-branch"),
        "git beats the DB"
    );
    assert_eq!(lima.status, WorkspaceStatus::TranscriptMissing);
    assert_eq!(lima.title.as_deref(), Some("Fix login"));
    assert_eq!(lima.other_sessions, 1);
    let oslo = &p.workspaces[1];
    assert!(oslo.archived);
    assert_eq!(oslo.status, WorkspaceStatus::FolderMissing);

    assert_eq!(p.defaults.model.as_deref(), Some("opus"));
    assert_eq!(p.defaults.editor.as_deref(), Some("intellij"));
    assert_eq!(p.defaults.permission_mode.as_deref(), Some("plan"));
}

/// The preview of this computer's real Conductor data. Read-only: it copies the
/// database to a private temp folder and moves nothing. Prints counts, names
/// and statuses only. `cargo test conductor_real -- --ignored --nocapture`
#[test]
#[ignore]
fn conductor_real_preview() {
    if !detect() {
        println!("No Conductor database here.");
        return;
    }
    let p = preview().unwrap();
    println!("repos: {}", p.repos.len());
    for r in &p.repos {
        println!(
            "  {} exists={} added={} copy={:?} commands={:?} not_imported={} notes={:?}",
            r.name,
            r.exists,
            r.already_added,
            r.setup.copy_files,
            r.setup.commands,
            r.not_imported.len(),
            r.notes
        );
    }
    let live: Vec<_> = p.workspaces.iter().filter(|w| !w.archived).collect();
    println!("workspaces: {} ({} live)", p.workspaces.len(), live.len());
    for w in live {
        println!(
            "  {}/{} {:?} branch={:?} others={}",
            w.repo_name, w.directory_name, w.status, w.branch, w.other_sessions
        );
    }
    let archived_on_disk = p
        .workspaces
        .iter()
        .filter(|w| w.archived && w.status != WorkspaceStatus::FolderMissing)
        .count();
    println!("archived with a folder still there: {archived_on_disk}");
    println!("defaults: {:?}", p.defaults);
    // Names and counts only: a prompt's text is the user's, and stays unprinted.
    let shared = p.prompts.iter().filter(|x| x.repos.len() > 1).count();
    let existing = p.prompts.iter().filter(|x| x.existing.is_some()).count();
    let renamed = p.prompts.iter().filter(|x| x.taken_name.is_some()).count();
    println!(
        "prompts: {} ({shared} shared by several repos, {existing} already saved, {renamed} renamed)",
        p.prompts.len()
    );
    for x in &p.prompts {
        println!(
            "  /{} {} repos={} chars={}",
            x.name,
            x.kind,
            x.repos.len(),
            x.body.chars().count()
        );
    }
}
