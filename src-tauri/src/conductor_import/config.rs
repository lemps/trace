//! A Conductor repo's scripts, from the three places Conductor has kept them,
//! translated into trace's `SetupConfig`.
//!
//! Highest first: `~/.conductor/settings.managed.toml`, the repo's
//! `.conductor/settings.local.toml` and `.conductor/settings.toml`,
//! `~/.conductor/settings.toml` (the current format), then the repo's
//! `conductor.json` (the older one), then the database's own columns. The first
//! that sets a script wins, per script.

use std::path::{Path, PathBuf};

use super::db::Row;
use super::include;
use super::translate;
use crate::repo_catalog::model::SetupConfig;

/// One place a script can be set.
#[derive(Default)]
struct Layer {
    setup: Option<String>,
    run: Option<String>,
    archive: Option<String>,
    include: Option<Vec<String>>,
}

/// A repo's setup as trace will run it, and what's left behind.
pub struct Translated {
    pub setup: SetupConfig,
    pub not_imported: Vec<String>,
    pub notes: Vec<String>,
}

/// `(column, what Conductor calls it)` for each custom prompt.
const PROMPTS: &[(&str, &str)] = &[
    ("custom_prompt_general", "general"),
    ("custom_prompt_create_pr", "create PR"),
    ("custom_prompt_code_review", "code review"),
    ("custom_prompt_fix_errors", "fix errors"),
    ("custom_prompt_resolve_merge_conflicts", "merge conflicts"),
    ("custom_prompt_rename_branch", "rename branch"),
];

/// Translate the repo at `root` (its DB row is `row`), with `home` the user's
/// home folder.
pub fn translate(row: &Row, root: &Path, home: &Path) -> Translated {
    let layers = layers(row, root, home);
    let pick = |f: fn(&Layer) -> Option<&String>| layers.iter().find_map(f).cloned();
    let setup_script = pick(|l| l.setup.as_ref());
    let run = pick(|l| l.run.as_ref());
    let archive = pick(|l| l.archive.as_ref());
    let mut globs = layers
        .iter()
        .find_map(|l| l.include.clone())
        .unwrap_or_default();
    if globs.is_empty() {
        globs = std::fs::read_to_string(root.join(".worktreeinclude"))
            .map(|t| t.lines().map(str::to_string).collect())
            .unwrap_or_default();
    }

    let (mut setup, mut notes) = setup_script
        .as_deref()
        .map(translate::setup_script)
        .unwrap_or_default();
    let (files, include_notes) = include::expand(root, &globs);
    notes.extend(include_notes);
    for f in files {
        if !setup.copy_files.contains(&f) {
            setup.copy_files.push(f);
        }
    }

    let mut not_imported = Vec::new();
    let mut leave = |what: &str, kind: &str, script: Option<String>| {
        if let Some(s) = script.filter(|s| !s.trim().is_empty()) {
            not_imported.push(format!("{what} ({}): trace has no {kind}.", first_line(&s)));
        }
    };
    leave("Run script", "run scripts", run);
    leave("Archive script", "archive scripts", archive);
    for (column, name) in PROMPTS {
        if row.get(*column).is_some_and(|p| !p.trim().is_empty()) {
            not_imported.push(format!(
                "Custom prompt ({name}): trace has no saved prompts to put it in yet."
            ));
        }
    }
    Translated {
        setup,
        not_imported,
        notes,
    }
}

fn first_line(s: &str) -> String {
    let line = s.trim().lines().next().unwrap_or("");
    let more = s.trim().lines().count() > 1;
    let short: String = line.chars().take(60).collect();
    if more || short.len() < line.len() {
        format!("{short}…")
    } else {
        short
    }
}

/// Every layer, highest first; files that are missing or unreadable are skipped.
fn layers(row: &Row, root: &Path, home: &Path) -> Vec<Layer> {
    let tomls: [PathBuf; 4] = [
        home.join(".conductor/settings.managed.toml"),
        root.join(".conductor/settings.local.toml"),
        root.join(".conductor/settings.toml"),
        home.join(".conductor/settings.toml"),
    ];
    let mut out: Vec<Layer> = tomls.iter().filter_map(|p| toml_layer(p)).collect();
    out.extend(json_layer(&root.join("conductor.json")));
    out.push(Layer {
        setup: row.get("setup_script").cloned(),
        run: row.get("run_script").cloned(),
        archive: row.get("archive_script").cloned(),
        include: None,
    });
    out
}

fn toml_layer(path: &Path) -> Option<Layer> {
    let table: toml::Table = std::fs::read_to_string(path).ok()?.parse().ok()?;
    let scripts = table.get("scripts").and_then(|v| v.as_table());
    let script = |key: &str| {
        scripts
            .and_then(|s| s.get(key))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };
    Some(Layer {
        setup: script("setup"),
        run: script("run"),
        archive: script("archive"),
        include: find_globs(&toml::Value::Table(table.clone())),
    })
}

/// `file_include_globs`, wherever in the file it is.
fn find_globs(value: &toml::Value) -> Option<Vec<String>> {
    let table = value.as_table()?;
    if let Some(list) = table.get("file_include_globs").and_then(|v| v.as_array()) {
        return Some(
            list.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect(),
        );
    }
    table.values().find_map(find_globs)
}

fn json_layer(path: &Path) -> Option<Layer> {
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let script = |key: &str| json["scripts"][key].as_str().map(str::to_string);
    Some(Layer {
        setup: script("setup"),
        run: script("run"),
        archive: script("archive"),
        include: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pairs: &[(&str, &str)]) -> Row {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn the_highest_layer_wins_per_script() {
        let home = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let (h, r) = (home.path(), root.path());
        std::fs::create_dir_all(r.join(".conductor")).unwrap();
        std::fs::create_dir_all(h.join(".conductor")).unwrap();
        std::fs::write(
            r.join(".conductor/settings.toml"),
            "[scripts]\nsetup = \"pnpm i\"\nrun = \"pnpm dev\"\n",
        )
        .unwrap();
        std::fs::write(
            r.join(".conductor/settings.local.toml"),
            "[scripts]\nsetup = \"cp $CONDUCTOR_ROOT_PATH/.env .\\nbun i\"\n",
        )
        .unwrap();
        std::fs::write(
            h.join(".conductor/settings.toml"),
            "[scripts]\narchive = \"echo bye\"\n",
        )
        .unwrap();
        std::fs::write(
            r.join("conductor.json"),
            r#"{"scripts":{"setup":"npm ci","run":"old"}}"#,
        )
        .unwrap();
        let t = translate(
            &row(&[
                ("setup_script", "make"),
                ("custom_prompt_code_review", "Be kind"),
            ]),
            r,
            h,
        );
        assert_eq!(t.setup.copy_files, vec![".env"]);
        assert_eq!(t.setup.commands, vec!["bun i"]);
        assert_eq!(t.not_imported.len(), 3, "{:?}", t.not_imported);
        assert!(t.not_imported[0].contains("pnpm dev"));
        assert!(t.not_imported[1].contains("echo bye"));
        assert!(t.not_imported[2].contains("code review"));
    }

    #[test]
    fn falls_back_to_conductor_json_then_the_database() {
        let home = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        let t = translate(&row(&[("setup_script", "make setup")]), r, home.path());
        assert_eq!(t.setup.commands, vec!["make setup"]);
        std::fs::write(
            r.join("conductor.json"),
            r#"{"scripts":{"setup":"ln -sf \"$CONDUCTOR_ROOT_PATH/a\" a"}}"#,
        )
        .unwrap();
        let t = translate(&row(&[("setup_script", "make setup")]), r, home.path());
        assert_eq!(
            t.setup.commands,
            vec![r#"ln -sf "$CONDUCTOR_ROOT_PATH/a" a"#]
        );
    }

    #[test]
    fn include_globs_come_from_toml_or_worktreeinclude() {
        let home = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        std::fs::write(r.join(".worktreeinclude"), "config/local.json\n").unwrap();
        let t = translate(&Row::new(), r, home.path());
        assert_eq!(t.setup.copy_files, vec!["config/local.json"]);
        std::fs::create_dir_all(r.join(".conductor")).unwrap();
        std::fs::write(
            r.join(".conductor/settings.toml"),
            "[workspace]\nfile_include_globs = [\"secrets.json\"]\n",
        )
        .unwrap();
        let t = translate(&Row::new(), r, home.path());
        assert_eq!(t.setup.copy_files, vec!["secrets.json"]);
    }
}
