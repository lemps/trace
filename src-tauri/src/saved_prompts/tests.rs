//! Temp dirs only: nothing here may touch trace's real config dir.

use std::fs;
use std::path::PathBuf;

use super::{apply_save, builtins, clean_name, delete_at, list_at, save_at, PromptDraft};

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> Self {
        let dir = std::env::temp_dir().join(format!("trace-prompts-{}", crate::helpers::new_id()));
        fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn file(&self) -> PathBuf {
        self.0.join("saved-prompts.json")
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn draft(id: Option<&str>, name: &str, body: &str) -> PromptDraft {
    PromptDraft {
        id: id.map(str::to_string),
        name: name.into(),
        title: format!("{name} title"),
        body: body.into(),
    }
}

fn names(list: &[super::SavedPrompt]) -> Vec<&str> {
    list.iter().map(|p| p.name.as_str()).collect()
}

#[test]
fn names_are_slugged_and_checked() {
    assert_eq!(clean_name(" /Review-PR ").unwrap(), "review-pr");
    assert_eq!(clean_name("fix_2").unwrap(), "fix_2");
    assert!(clean_name("").is_err());
    assert!(clean_name("/").is_err());
    assert!(clean_name("two words").is_err());
    assert!(clean_name("saved:review").is_err());
    assert!(clean_name("-dash").is_err());
    assert!(clean_name(&"a".repeat(41)).is_err());
}

#[test]
fn a_new_install_lists_the_builtins() {
    let dir = TempDir::new();
    assert_eq!(
        names(&list_at(&dir.file()).unwrap()),
        vec!["review-diff", "pr"]
    );
    // Reading writes nothing.
    assert!(!dir.file().exists());
}

#[test]
fn saving_adds_and_keeps_the_builtins() {
    let dir = TempDir::new();
    let saved = save_at(&dir.file(), &draft(None, "/Tests", "  Run the tests.  ")).unwrap();
    assert_eq!(saved.name, "tests");
    assert_eq!(saved.body, "Run the tests.");
    assert_eq!(saved.created_at, saved.updated_at);
    let list = list_at(&dir.file()).unwrap();
    assert_eq!(names(&list), vec!["review-diff", "pr", "tests"]);
}

#[test]
fn a_builtin_can_be_edited_and_deleted_for_good() {
    let dir = TempDir::new();
    let edited = save_at(
        &dir.file(),
        &draft(Some("builtin-review-diff"), "check", "Check it."),
    )
    .unwrap();
    assert_eq!(edited.id, "builtin-review-diff");
    delete_at(&dir.file(), "builtin-pr").unwrap();
    let list = list_at(&dir.file()).unwrap();
    assert_eq!(names(&list), vec!["check"]);
    assert_eq!(list[0].body, "Check it.");
    // Deleting the last one leaves an empty list, not the built-ins back.
    delete_at(&dir.file(), "builtin-review-diff").unwrap();
    assert!(list_at(&dir.file()).unwrap().is_empty());
}

#[test]
fn names_are_unique_but_a_prompt_keeps_its_own() {
    let mut prompts = builtins(1);
    let err = apply_save(&mut prompts, &draft(None, "pr", "x"), || "n".into(), 2).unwrap_err();
    assert!(err.contains("/pr"), "{err}");
    let kept = apply_save(
        &mut prompts,
        &draft(Some("builtin-pr"), "pr", "New body"),
        || "n".into(),
        2,
    )
    .unwrap();
    assert_eq!(kept.body, "New body");
    assert_eq!((kept.created_at, kept.updated_at), (1, 2));
}

#[test]
fn bad_drafts_are_refused() {
    let mut prompts = Vec::new();
    let mut save = |d: PromptDraft| apply_save(&mut prompts, &d, || "id".into(), 0);
    assert!(save(draft(None, "x", "   ")).is_err());
    assert!(save(draft(Some("gone"), "x", "body")).is_err());
    let untitled = save(PromptDraft {
        id: None,
        name: "x".into(),
        title: "  ".into(),
        body: "body".into(),
    })
    .unwrap();
    assert_eq!(untitled.title, "x");
}

#[test]
fn a_partial_file_loads() {
    let dir = TempDir::new();
    fs::write(dir.file(), "{}").unwrap();
    assert!(list_at(&dir.file()).unwrap().is_empty());
    fs::write(
        dir.file(),
        r#"{"prompts":[{"id":"a","name":"a","title":"A","body":"b"}]}"#,
    )
    .unwrap();
    assert_eq!(list_at(&dir.file()).unwrap()[0].created_at, 0);
}
