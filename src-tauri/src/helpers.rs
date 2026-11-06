//! Small shared helpers used across modules.

pub mod persist;

use std::path::{Component, Path, PathBuf};

use uuid::Uuid;

/// trace's config/data dir (`~/Library/Application Support/trace` on macOS). The
/// home for persisted JSON and the generated agent tooling. Mirrors the
/// `dirs::config_dir().join("trace")` pattern used in `commands/*`.
pub fn trace_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("trace")
}

/// Dir prepended to every agent's PATH; holds trace-generated CLIs like the
/// `trace-render` producer (see `claude::render_bridge`).
pub fn trace_bin_dir() -> PathBuf {
    trace_dir().join("bin")
}

/// Restrict a config file to user-only access (0600). Everything we persist
/// under the config dir ends up this way (state files via `persist`, which creates
/// them 0600) — session ids and repo paths aren't token-grade secrets, but a
/// world-readable session id still lets another local user resume the conversation.
#[cfg(unix)]
pub fn restrict_perms(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
pub fn restrict_perms(_path: &Path) {}

/// Validate a path the renderer sent that must stay under some root. Only plain
/// names are allowed: anything absolute or containing `..` could read or remove
/// files outside the worktree the caller is scoped to.
pub fn safe_relative_path(path: &str) -> Result<&Path, String> {
    let rel = Path::new(path);
    let is_safe = !path.is_empty() && rel.components().all(|c| matches!(c, Component::Normal(_)));
    if is_safe {
        Ok(rel)
    } else {
        Err("Invalid file path.".to_string())
    }
}

/// A fresh random id.
pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Lowercase, hyphenated slug suitable for branch names.
pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::{safe_relative_path, slugify};

    #[test]
    fn safe_relative_path_allows_only_paths_below_the_root() {
        assert!(safe_relative_path("src/main.rs").is_ok());
        assert!(safe_relative_path("a b/c.txt").is_ok());
        for bad in [
            "",
            "/etc/passwd",
            "../secret",
            "src/../../secret",
            "./x",
            "/",
        ] {
            assert!(safe_relative_path(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn slugify_issue_keys_and_edges() {
        assert_eq!(slugify("TRACE-12"), "trace-12");
        assert_eq!(slugify("My Feature!!"), "my-feature");
        assert_eq!(slugify("--weird  input--"), "weird-input");
        assert_eq!(slugify("héllo wörld"), "h-llo-w-rld");
        assert_eq!(slugify(""), "");
        assert_eq!(slugify("!!!"), "");
    }
}
