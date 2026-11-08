//! Conductor's custom prompts as saved prompts: naming, dedupe, collisions, the
//! apply step, and that reading them never reads a secret. Temp files only.

use rusqlite::Connection;

use super::db::{self, Row};
use super::model::{PromptChoice, PromptPreview, Report};
use super::prompts::{plan, repo_slug, unique};
use super::{preview_of, prompt_apply};
use crate::saved_prompts::{add_all_at, builtins, clean_name, list_at, SavedPrompt, MAX_NAME};

fn repo(id: &str, name: &str, prompts: &[(&str, &str)]) -> Row {
    let mut row: Row = [("id", id), ("name", name)]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    for (kind, body) in prompts {
        row.insert(format!("custom_prompt_{kind}"), body.to_string());
    }
    row
}

fn names(plan: &[PromptPreview]) -> Vec<&str> {
    plan.iter().map(|p| p.name.as_str()).collect()
}

#[test]
fn each_kind_gets_its_name_and_general_is_the_repos_context() {
    let app = repo(
        "r1",
        "My App",
        &[
            ("create_pr", "Open a PR"),
            ("code_review", "Review it"),
            ("fix_errors", "Fix them"),
            ("resolve_merge_conflicts", "Resolve them"),
            ("rename_branch", "Rename it"),
            ("general", "We use pnpm"),
        ],
    );
    let p = plan(&[&app], &[]);
    assert_eq!(
        names(&p),
        vec![
            "pr",
            "review",
            "fix-errors",
            "resolve-conflicts",
            "rename-branch",
            "my-app-context"
        ]
    );
    assert_eq!(p[0].key, "createPr:r1");
    assert_eq!(p[5].title, "Context for My App");
    assert!(p
        .iter()
        .all(|x| x.existing.is_none() && x.taken_name.is_none()));
}

#[test]
fn empty_prompts_are_left_out() {
    let app = repo("r1", "app", &[("create_pr", "  \n "), ("general", "")]);
    assert!(plan(&[&app], &[]).is_empty());
}

#[test]
fn the_same_text_in_several_repos_is_one_prompt() {
    let a = repo(
        "r1",
        "app",
        &[("create_pr", "Open a PR"), ("general", "Ctx")],
    );
    let b = repo(
        "r2",
        "web",
        &[("create_pr", " Open a PR\n"), ("general", "Ctx")],
    );
    let p = plan(&[&a, &b], &[]);
    assert_eq!(names(&p), vec!["pr", "context"]);
    assert_eq!(p[0].repos, vec!["app", "web"]);
    assert_eq!(p[0].body, "Open a PR");
}

#[test]
fn different_texts_for_one_kind_get_the_repo_in_the_name() {
    let a = repo("r1", "app", &[("create_pr", "Open a PR"), ("general", "A")]);
    let b = repo("r2", "web", &[("create_pr", "Open a draft PR")]);
    let c = repo("r3", "api", &[("create_pr", "Open a PR"), ("general", "C")]);
    let p = plan(&[&a, &b, &c], &[]);
    assert_eq!(
        names(&p),
        vec!["app-pr", "web-pr", "app-context", "api-context"]
    );
    assert_eq!(p[0].repos, vec!["app", "api"], "app and api share a text");
    assert_eq!(p[0].title, "Create a PR (app, api)");
}

#[test]
fn never_takes_an_existing_name_and_spots_an_existing_text() {
    let mut saved = builtins(0);
    saved.push(SavedPrompt {
        id: "x".into(),
        name: "review".into(),
        title: "Mine".into(),
        body: "Already here".into(),
        created_at: 0,
        updated_at: 0,
    });
    let app = repo(
        "r1",
        "app",
        &[
            ("create_pr", "Conductor's PR text"),
            ("code_review", "  Already here "),
            ("fix_errors", builtins(0)[1].body.as_str()),
        ],
    );
    let p = plan(&[&app], &saved);
    assert_eq!(p[0].name, "pr-2", "the built-in /pr stays");
    assert_eq!(p[0].taken_name.as_deref(), Some("pr"));
    assert_eq!(p[1].existing.as_deref(), Some("review"));
    assert_eq!(p[2].existing.as_deref(), Some("pr"), "found under any name");
}

#[test]
fn proposed_names_are_unique_and_valid() {
    // Two repos whose names slug alike, and a very long one.
    let long = "A".repeat(80);
    let a = repo("r1", "my app", &[("create_pr", "1"), ("general", "x")]);
    let b = repo("r2", "my-app", &[("create_pr", "2"), ("general", "y")]);
    let c = repo("r3", &long, &[("create_pr", "3")]);
    let d = repo("r4", "日本", &[("general", "z")]);
    let p = plan(&[&a, &b, &c, &d], &[]);
    assert_eq!(
        names(&p)[..2],
        ["my-app-pr", "my-app-pr-2"],
        "{:?}",
        names(&p)
    );
    assert!(names(&p).contains(&"repo-context"));
    let mut seen = std::collections::HashSet::new();
    for x in &p {
        assert_eq!(clean_name(&x.name).as_deref(), Ok(x.name.as_str()));
        assert!(x.name.len() <= MAX_NAME, "{}", x.name);
        assert!(seen.insert(x.name.clone()), "{} twice", x.name);
    }
}

#[test]
fn slugs_and_suffixes() {
    assert_eq!(repo_slug("  Trace / Desktop! ", 40), "trace-desktop");
    assert_eq!(repo_slug("abc-def", 4), "abc");
    assert_eq!(repo_slug("---", 40), "repo");
    let taken = vec!["pr".to_string(), "pr-2".to_string()];
    assert_eq!(unique("pr", &taken), "pr-3");
    assert_eq!(unique("lint", &taken), "lint");
    let long = "a".repeat(MAX_NAME);
    assert_eq!(unique(&long, std::slice::from_ref(&long)).len(), MAX_NAME);
}

#[test]
fn apply_adds_only_what_was_ticked_and_never_overwrites() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("saved-prompts.json");
    let app = repo(
        "r1",
        "app",
        &[
            ("create_pr", "Open a PR"),
            ("code_review", "Review"),
            ("fix_errors", "Fix"),
            ("rename_branch", builtins(0)[0].body.as_str()),
            ("general", "Ctx"),
        ],
    );
    let p = plan(&[&app], &list_at(&file).unwrap());
    let choose = |key: &str, name: Option<&str>| PromptChoice {
        key: key.into(),
        name: name.map(str::to_string),
    };
    let chosen = [
        choose("createPr:r1", None),
        choose("codeReview:r1", Some(" check ")),
        choose("general:r1", Some("review-diff")),
        choose("renameBranch:r1", None),
    ];
    let mut report = Report::default();
    prompt_apply::apply(&p, &chosen, |d| add_all_at(&file, d), &mut report);

    let ok: Vec<&str> = report.imported.iter().map(|i| i.item.as_str()).collect();
    assert_eq!(ok, vec!["/pr-2", "/check"]);
    let skipped: Vec<String> = report.skipped.iter().map(|i| i.item.clone()).collect();
    assert!(skipped.contains(&"/review-diff".to_string()), "{skipped:?}");
    assert!(skipped.contains(&"Rename the branch".to_string()));
    assert!(skipped.contains(&"1 Conductor prompts".to_string()));

    let list = list_at(&file).unwrap();
    let saved: Vec<&str> = list.iter().map(|x| x.name.as_str()).collect();
    assert_eq!(saved, vec!["review-diff", "pr", "pr-2", "check"]);
    assert_eq!(list[0].body, builtins(0)[0].body, "/review-diff untouched");
    assert_eq!(list[1].body, builtins(0)[1].body, "/pr untouched");
    assert_eq!(list[2].body, "Open a PR");
}

#[test]
fn reads_prompts_from_a_conductor_db_and_never_its_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("conductor.db");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(
        "CREATE TABLE repos (id TEXT, name TEXT, root_path TEXT, hidden INTEGER,
            custom_prompt_create_pr TEXT, custom_prompt_general TEXT,
            custom_prompt_code_review TEXT, claude_env_vars TEXT, conductor_api_token TEXT);
         CREATE TABLE settings (key TEXT, value TEXT);
         INSERT INTO repos VALUES
            ('r1', 'app', '/nowhere/app', 0, 'Open a PR', 'Use pnpm', NULL,
                'AWS_SECRET=repo-secret', 'repo-token'),
            ('r2', 'web', '/nowhere/web', 0, 'Open a PR', NULL, 'Review',
                'AWS_SECRET=repo-secret', 'repo-token'),
            ('r3', 'hid', '/nowhere/hid', 1, 'Hidden repo text', NULL, NULL, NULL, NULL);
         INSERT INTO settings VALUES ('claude_env_vars', 'AWS_SECRET_ACCESS_KEY=setting-secret'),
            ('conductor_api_token', 'setting-token');",
    )
    .unwrap();
    drop(conn);
    let before = std::fs::read(&path).unwrap();

    let snap = db::read(&path).unwrap();
    let p = preview_of(&snap, dir.path(), &[], &builtins(0));
    let pr = p.prompts.iter().find(|x| x.kind == "createPr").unwrap();
    assert_eq!(pr.repos, vec!["app", "web"], "hidden repos are left out");
    assert_eq!(pr.name, "pr-2");
    assert_eq!(names(&p.prompts), vec!["pr-2", "review", "app-context"]);
    assert_eq!(p.saved_prompt_names, vec!["review-diff", "pr"]);

    let everything = format!("{snap:?} {}", serde_json::to_string(&p).unwrap());
    for secret in ["secret", "token"] {
        assert!(!everything.contains(secret), "{secret} was read");
    }
    assert_eq!(
        std::fs::read(&path).unwrap(),
        before,
        "the source is untouched"
    );
}
