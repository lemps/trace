//! Trust the worktrees trace makes, so Claude doesn't stop every new agent at "Do
//! you trust this folder?". Only checkouts under `<repo>/.worktrees/` of a repo the
//! user added to trace qualify: adding the repo is the decision to trust its code,
//! and a worktree is that same code. Anything else still gets Claude's own prompt.
//!
//! Claude keeps trust in its global config (`~/.claude.json`) as
//! `projects[<path>].hasTrustDialogAccepted`. It writes that file itself while it
//! runs, so the update takes Claude's lock (`<file>.lock`, a directory), re-reads
//! under it and replaces the file atomically. Best effort: on any failure the agent
//! just asks as before.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Map, Value};

/// Mark `cwd` trusted for Claude when it's a trace worktree of a configured repo.
pub fn trust_worktree(cwd: &str) {
    if !is_known_worktree(cwd, &crate::commands::repos::all_repos()) {
        return;
    }
    let Some(file) = config_file() else {
        return;
    };
    if let Err(e) = grant(&file, &trust_key(cwd)) {
        eprintln!("[trace] couldn't pre-trust {cwd} for Claude: {e}");
    }
}

/// Whether `cwd` is a checkout below `<repo>/.worktrees/` of one of `repos`.
fn is_known_worktree(cwd: &str, repos: &[String]) -> bool {
    repos.iter().any(|repo| {
        crate::platform::paths::below_worktrees(cwd, repo).is_some_and(|rest| {
            let rest = rest.trim_end_matches('/');
            !rest.is_empty() && crate::helpers::safe_relative_path(rest).is_ok()
        })
    })
}

/// The key Claude looks a folder up by: its path, with `/` separators on Windows.
fn trust_key(cwd: &str) -> String {
    crate::platform::paths::forward(cwd)
        .trim_end_matches('/')
        .to_string()
}

/// Claude's global config: the legacy `.config.json` if present, else
/// `.claude.json` in `CLAUDE_CONFIG_DIR` or the home folder.
fn config_file() -> Option<PathBuf> {
    let custom = std::env::var_os("CLAUDE_CONFIG_DIR")
        .filter(|d| !d.is_empty())
        .map(PathBuf::from);
    let home = dirs::home_dir()?;
    let legacy = custom
        .clone()
        .unwrap_or_else(|| home.join(".claude"))
        .join(".config.json");
    if legacy.is_file() {
        return Some(legacy);
    }
    Some(custom.unwrap_or(home).join(".claude.json"))
}

#[derive(Debug, PartialEq)]
enum Change {
    Unchanged,
    Changed,
    /// The config isn't shaped as expected; leave it alone.
    Refuse,
}

/// Set `projects[key].hasTrustDialogAccepted`, keeping the entry's other fields.
fn apply(config: &mut Value, key: &str) -> Change {
    let Some(root) = config.as_object_mut() else {
        return Change::Refuse;
    };
    let projects = root
        .entry("projects")
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(projects) = projects.as_object_mut() else {
        return Change::Refuse;
    };
    let entry = projects
        .entry(key)
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(entry) = entry.as_object_mut() else {
        return Change::Refuse;
    };
    if entry.get("hasTrustDialogAccepted") == Some(&Value::Bool(true)) {
        return Change::Unchanged;
    }
    entry.insert("hasTrustDialogAccepted".into(), Value::Bool(true));
    Change::Changed
}

fn read(file: &Path) -> Result<Option<Value>, String> {
    match fs::read_to_string(file) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("{} isn't valid JSON: {e}", file.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Trust `key` in the config at `file`. A missing file means Claude has never run
/// here; it's left for Claude to create.
fn grant(file: &Path, key: &str) -> Result<(), String> {
    // A cheap check first, so the common already-trusted case never locks.
    let Some(mut probe) = read(file)? else {
        return Ok(());
    };
    match apply(&mut probe, key) {
        Change::Unchanged => return Ok(()),
        Change::Refuse => return Err("unexpected config shape".into()),
        Change::Changed => {}
    }
    let _lock = Lock::take(file)?;
    let Some(mut config) = read(file)? else {
        return Ok(());
    };
    match apply(&mut config, key) {
        Change::Unchanged => Ok(()),
        Change::Refuse => Err("unexpected config shape".into()),
        Change::Changed => replace(file, &config),
    }
}

/// Write `config` beside `file` and rename it over, keeping the file's permissions
/// and, for a symlinked config, the link.
fn replace(file: &Path, config: &Value) -> Result<(), String> {
    let target = match fs::symlink_metadata(file) {
        Ok(m) if m.file_type().is_symlink() => fs::canonicalize(file).map_err(|e| e.to_string())?,
        _ => file.to_path_buf(),
    };
    let permissions = fs::metadata(&target)
        .map_err(|e| e.to_string())?
        .permissions();
    let mut name = target.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".trace-trust-{}.tmp", std::process::id()));
    let tmp = target.with_file_name(name);
    let mut text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    text.push('\n');
    let written = (|| {
        // Narrow the permissions before any content lands in the file.
        fs::write(&tmp, "")?;
        fs::set_permissions(&tmp, permissions)?;
        fs::write(&tmp, &text)?;
        rename_with_retry(&tmp, &target)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written.map_err(|e| e.to_string())
}

/// A rename over a file another process has open can fail for a moment on Windows.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut last = None;
    for attempt in 0..5 {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => last = Some(e),
        }
        std::thread::sleep(Duration::from_millis(40 * (attempt + 1)));
    }
    Err(last.expect("at least one attempt"))
}

/// Claude's lock on its config: a `<file>.lock` directory, held only while trace
/// reads, changes and replaces the file.
struct Lock(PathBuf);

impl Lock {
    fn take(file: &Path) -> Result<Lock, String> {
        let mut name = file.as_os_str().to_os_string();
        name.push(".lock");
        let dir = PathBuf::from(name);
        for attempt in 0..5u64 {
            if fs::create_dir(&dir).is_ok() {
                return Ok(Lock(dir));
            }
            std::thread::sleep(Duration::from_millis(50 * (attempt + 1)));
        }
        Err("Claude's config is locked".into())
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_worktrees_of_configured_repos_qualify() {
        let repos = vec!["/src/app".to_string()];
        assert!(is_known_worktree("/src/app/.worktrees/t-12", &repos));
        assert!(is_known_worktree("/src/app/.worktrees/t-12/", &repos));
        assert!(!is_known_worktree("/src/app", &repos));
        assert!(!is_known_worktree("/src/app/.worktrees/", &repos));
        assert!(!is_known_worktree("/src/app/.worktrees/../../etc", &repos));
        assert!(!is_known_worktree("/src/other/.worktrees/t-12", &repos));
    }

    #[test]
    fn apply_adds_trust_and_keeps_other_fields() {
        let mut config = json!({
            "numStartups": 3,
            "projects": { "/wt": { "allowedTools": ["Bash"] } }
        });
        assert_eq!(apply(&mut config, "/wt"), Change::Changed);
        assert_eq!(config["projects"]["/wt"]["hasTrustDialogAccepted"], true);
        assert_eq!(config["projects"]["/wt"]["allowedTools"][0], "Bash");
        assert_eq!(config["numStartups"], 3);
        assert_eq!(apply(&mut config, "/wt"), Change::Unchanged);
    }

    #[test]
    fn apply_creates_projects_and_refuses_odd_shapes() {
        let mut config = json!({});
        assert_eq!(apply(&mut config, "/wt"), Change::Changed);
        assert_eq!(config["projects"]["/wt"]["hasTrustDialogAccepted"], true);
        assert_eq!(apply(&mut json!({ "projects": [] }), "/wt"), Change::Refuse);
        assert_eq!(apply(&mut json!([]), "/wt"), Change::Refuse);
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("trace-trust-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn grant_rewrites_the_file_and_releases_the_lock() {
        let dir = scratch("grant");
        let file = dir.join(".claude.json");
        fs::write(&file, r#"{"userID":"u","projects":{}}"#).unwrap();
        grant(&file, "/wt").unwrap();
        let config: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
        assert_eq!(config["projects"]["/wt"]["hasTrustDialogAccepted"], true);
        assert_eq!(config["userID"], "u");
        assert!(!dir.join(".claude.json.lock").exists());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1, "no temp file left");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn grant_leaves_a_missing_or_locked_config_alone() {
        let dir = scratch("locked");
        let file = dir.join(".claude.json");
        grant(&file, "/wt").unwrap();
        assert!(!file.exists());
        fs::write(&file, "{}").unwrap();
        fs::create_dir(dir.join(".claude.json.lock")).unwrap();
        assert!(grant(&file, "/wt").is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "{}");
        fs::remove_dir_all(&dir).unwrap();
    }
}
