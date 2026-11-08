//! Conductor's "files to copy into a new workspace" (`file_include_globs`, or a
//! `.worktreeinclude` in gitignore syntax), expanded into the plain relative
//! paths trace's `SetupConfig::copy_files` holds.

use std::path::Path;

use crate::repo_catalog::model::is_inside_relative;

/// The files under `root` the patterns name, and a note for each pattern that
/// can't become a file copy (a directory, or nothing there yet).
pub fn expand(root: &Path, patterns: &[String]) -> (Vec<String>, Vec<String>) {
    let mut files: Vec<String> = Vec::new();
    let mut notes = Vec::new();
    let untracked = untracked(root);
    for raw in patterns {
        let pattern = raw.trim();
        if pattern.is_empty() || pattern.starts_with('#') {
            continue;
        }
        if let Some(negated) = pattern.strip_prefix('!') {
            files.retain(|f| !matches(negated, f));
            continue;
        }
        if pattern.ends_with('/') {
            notes.push(format!("{pattern} is a folder: setup copies files only."));
            continue;
        }
        let found: Vec<String> = if has_wildcard(pattern) {
            untracked
                .iter()
                .filter(|f| matches(pattern, f))
                .cloned()
                .collect()
        } else {
            let rel = pattern.trim_start_matches('/').to_string();
            if root.join(&rel).is_dir() {
                notes.push(format!("{pattern} is a folder: setup copies files only."));
                continue;
            }
            // Kept even when absent: the user may make it later, and a missing
            // file is skipped at setup time.
            vec![rel]
        };
        if found.is_empty() {
            notes.push(format!("{pattern} matches no untracked file right now."));
        }
        for f in found {
            if is_inside_relative(&f) && !files.contains(&f) {
                files.push(f);
            }
        }
    }
    (files, notes)
}

fn has_wildcard(p: &str) -> bool {
    p.contains(['*', '?', '['])
}

/// Untracked files under `root` (ignored ones included, since `.env`s usually
/// are), with wholly-untracked folders like `node_modules/` collapsed and left out.
fn untracked(root: &Path) -> Vec<String> {
    let Ok(out) = crate::claude::discovery::command("git")
        .args([
            "ls-files",
            "--others",
            "--directory",
            "--no-empty-directory",
            "-z",
        ])
        .current_dir(root)
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter(|f| !f.is_empty() && !f.ends_with('/'))
        .map(str::to_string)
        .collect()
}

/// Whether gitignore-style `pattern` matches the relative file `path`. Without a
/// `/` it matches the file name at any depth; with one it's anchored at the root.
pub fn matches(pattern: &str, path: &str) -> bool {
    let anchored = pattern.trim_start_matches('/');
    if !pattern.trim_end_matches('/').contains('/') {
        let name = path.rsplit('/').next().unwrap_or(path);
        return glob(anchored.as_bytes(), name.as_bytes());
    }
    glob(anchored.as_bytes(), path.as_bytes())
}

/// `*` and `?` stay within one path segment; `**` crosses any number.
fn glob(p: &[u8], s: &[u8]) -> bool {
    match p.first() {
        None => s.is_empty(),
        Some(b'*') if p.get(1) == Some(&b'*') => {
            // `**/` matches zero or more whole segments.
            let rest = p[2..].strip_prefix(b"/").unwrap_or(&p[2..]);
            (0..=s.len()).any(|i| (i == 0 || s[i - 1] == b'/') && glob(rest, &s[i..]))
                || glob(rest, s)
        }
        Some(b'*') => {
            let rest = &p[1..];
            (0..=s.len())
                .take_while(|&i| i == 0 || s[i - 1] != b'/')
                .any(|i| glob(rest, &s[i..]))
        }
        Some(b'?') => s.first().is_some_and(|&c| c != b'/') && glob(&p[1..], &s[1..]),
        Some(b'[') => match p.iter().position(|&c| c == b']') {
            Some(end) if end > 1 => {
                let set = &p[1..end];
                let (neg, set) = match set.first() {
                    Some(b'!') | Some(b'^') => (true, &set[1..]),
                    _ => (false, set),
                };
                s.first()
                    .is_some_and(|c| *c != b'/' && set.contains(c) != neg)
                    && glob(&p[end + 1..], &s[1..])
            }
            _ => s.first() == Some(&b'[') && glob(&p[1..], &s[1..]),
        },
        Some(c) => s.first() == Some(c) && glob(&p[1..], &s[1..]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_like_gitignore() {
        assert!(matches(".env", ".env"));
        assert!(matches(".env", "apps/web/.env"));
        assert!(matches(".env.*", "apps/web/.env.local"));
        assert!(!matches(".env.*", ".env"));
        assert!(matches("/config/*.json", "config/a.json"));
        assert!(!matches("/config/*.json", "config/sub/a.json"));
        assert!(matches("config/**/*.json", "config/sub/deep/a.json"));
        assert!(matches("config/**/*.json", "config/a.json"));
        assert!(matches(
            "**/secrets.properties",
            "src/main/secrets.properties"
        ));
        assert!(matches("a?c", "abc"));
        assert!(matches("[ab].txt", "b.txt"));
        assert!(!matches("[!ab].txt", "b.txt"));
    }

    #[test]
    fn expands_against_untracked_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let git = |args: &[&str]| {
            crate::claude::discovery::command("git")
                .args(args)
                .current_dir(root)
                .output()
                .unwrap()
        };
        assert!(git(&["init", "-q"]).status.success());
        std::fs::write(root.join(".gitignore"), ".env*\n").unwrap();
        std::fs::write(root.join(".env"), "A=1").unwrap();
        std::fs::write(root.join(".env.local"), "B=1").unwrap();
        std::fs::create_dir_all(root.join("certs")).unwrap();
        std::fs::write(root.join("certs/dev.pem"), "x").unwrap();
        let patterns: Vec<String> = [".env*", "!.env.local", "certs", "later.json", "*.nope"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let (files, notes) = expand(root, &patterns);
        assert_eq!(files, vec![".env", "later.json"]);
        assert_eq!(notes.len(), 2, "{notes:?}");
    }
}
