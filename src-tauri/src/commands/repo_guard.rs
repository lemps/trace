//! Checks on a repo path before it joins `repos.json`. Registering a repo makes
//! its worktrees trusted for Claude (`claude::folder_trust`), so a path an agent
//! asks for (`add_repo` over MCP) is checked here before the user is asked, and
//! again by `add_repo` itself once they approve.

use std::path::{Path, PathBuf};

use crate::git;

/// Inside trace's own config dir (its state, scratch folders, generated tools):
/// never a repo to hand agents.
fn inside(path: &Path, dir: &Path) -> bool {
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    canon(path).starts_with(canon(dir))
}

/// Refuse a path inside trace's config dir. Every `add_repo` goes through this.
pub(crate) fn outside_config(path: &str) -> Result<(), String> {
    outside(path, &crate::helpers::trace_dir())
}

fn outside(path: &str, config: &Path) -> Result<(), String> {
    if inside(Path::new(path), config) {
        return Err(format!(
            "{path} is inside trace's own config folder, so it can't be added as a repository."
        ));
    }
    Ok(())
}

/// The repo's top-level folder, as git sees it.
fn toplevel(path: &str) -> Option<PathBuf> {
    let out = crate::claude::discovery::command("git")
        .args(["rev-parse", "--show-toplevel"])
        .current_dir(path)
        .output()
        .ok()
        .filter(|o| o.status.success())?;
    let top = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!top.is_empty()).then(|| PathBuf::from(top))
}

/// An agent's `add_repo` path, checked: absolute, an existing folder, the top
/// of a git repository (not a folder inside one), and outside trace's config
/// dir. Returns the path to register (trimmed, no trailing separator).
pub(crate) fn check(path: &str, config: &Path) -> Result<String, String> {
    let path = path.trim().trim_end_matches(['/', '\\']);
    if path.is_empty() {
        return Err("Give the repository's folder as an absolute path.".into());
    }
    if path.contains("://") || path.starts_with("git@") {
        return Err(
            "That's a remote URL. add_repo takes a local folder; use clone_repo for GitHub.".into(),
        );
    }
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err(format!("{path} isn't an absolute path."));
    }
    if !p.is_dir() {
        return Err(format!("{path} isn't a folder on this machine."));
    }
    outside(path, config)?;
    if !git::is_git_repo(path) {
        return Err(format!("{path} isn't a git repository."));
    }
    let same = |a: &Path, b: &Path| match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    match toplevel(path) {
        Some(top) if same(&top, p) => Ok(path.to_string()),
        Some(top) => Err(format!(
            "{path} is inside the repository at {}. Add that folder instead.",
            top.display()
        )),
        None => Err(format!("{path} isn't a git repository.")),
    }
}

/// `check` for the renderer's `add_repo` tool, before it asks the user.
#[tauri::command]
pub fn check_repo_path(path: String) -> Result<String, String> {
    check(&path, &crate::helpers::trace_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("trace-guard-{name}-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn git_init(dir: &Path) {
        let ok = crate::claude::discovery::command("git")
            .args(["init", "-q"])
            .current_dir(dir)
            .status()
            .unwrap()
            .success();
        assert!(ok);
    }

    #[test]
    fn a_repo_top_level_is_accepted_without_its_trailing_slash() {
        let repo = temp("ok");
        git_init(&repo);
        let config = temp("cfg");
        let given = format!("{}/", repo.display());
        assert_eq!(check(&given, &config).unwrap(), repo.display().to_string());
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&config);
    }

    #[test]
    fn relative_missing_remote_and_plain_folders_are_refused() {
        let config = temp("cfg2");
        let plain = temp("plain");
        for bad in [
            "",
            "   ",
            "relative/path",
            "https://github.com/o/r",
            "git@github.com:o/r.git",
        ] {
            assert!(check(bad, &config).is_err(), "{bad:?}");
        }
        let missing = plain.join("nope");
        assert!(check(&missing.display().to_string(), &config).is_err());
        let err = check(&plain.display().to_string(), &config).unwrap_err();
        assert!(err.contains("isn't a git repository"), "{err}");
        let _ = std::fs::remove_dir_all(&plain);
        let _ = std::fs::remove_dir_all(&config);
    }

    #[test]
    fn a_folder_inside_a_repo_names_the_repo() {
        let repo = temp("sub");
        git_init(&repo);
        std::fs::create_dir_all(repo.join("src")).unwrap();
        let config = temp("cfg3");
        let err = check(&repo.join("src").display().to_string(), &config).unwrap_err();
        assert!(err.contains("inside the repository"), "{err}");
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&config);
    }

    #[test]
    fn a_repo_inside_traces_config_dir_is_refused() {
        let config = temp("cfg4");
        let repo = config.join("sessions").join("x");
        std::fs::create_dir_all(&repo).unwrap();
        git_init(&repo);
        let err = check(&repo.display().to_string(), &config).unwrap_err();
        assert!(err.contains("config folder"), "{err}");
        assert!(outside(&repo.display().to_string(), &config).is_err());
        assert!(outside(&std::env::temp_dir().display().to_string(), &config).is_ok());
        let _ = std::fs::remove_dir_all(&config);
    }
}
