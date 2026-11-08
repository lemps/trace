//! Path strings across operating systems. Git reports `C:/repo` while Windows dialogs
//! give `C:\repo`, so trace keeps forward slashes internally, which Windows also
//! accepts. Pure functions with the OS as a parameter, so a Mac tests the Windows rules.

const WINDOWS: bool = cfg!(windows);

fn forward_on(path: &str, windows: bool) -> String {
    if windows {
        path.replace('\\', "/")
    } else {
        path.to_string()
    }
}

/// `path` with forward slashes on Windows, and untouched elsewhere: a backslash is a
/// legal file name character on Unix.
pub fn forward(path: &str) -> String {
    forward_on(path, WINDOWS)
}

fn basename_on(path: &str, windows: bool) -> String {
    let path = forward_on(path, windows);
    let trimmed = path.trim_end_matches('/');
    trimmed.rsplit('/').next().unwrap_or(trimmed).to_string()
}

/// The last component of a path string.
pub fn basename(path: &str) -> String {
    basename_on(path, WINDOWS)
}

/// A workspace's checkout: `<repo>/.worktrees/<dirname>`.
pub fn worktree_dir(repo: &str, dirname: &str) -> String {
    format!("{}/.worktrees/{dirname}", forward(repo))
}

fn strip_prefix_on<'a>(path: &'a str, prefix: &str, windows: bool) -> Option<&'a str> {
    if !windows {
        return path.strip_prefix(prefix);
    }
    // Windows paths are case-insensitive, and drive letters come back in either case.
    let head = path.get(..prefix.len())?;
    let same = forward_on(head, true).eq_ignore_ascii_case(&forward_on(prefix, true));
    same.then(|| &path[prefix.len()..])
}

/// What's left of `path` below `<repo>/.worktrees/`, if it's inside.
pub fn below_worktrees<'a>(path: &'a str, repo: &str) -> Option<&'a str> {
    strip_prefix_on(path, &format!("{}/.worktrees/", forward(repo)), WINDOWS)
}

/// The folder Claude keeps a working directory's conversations in: every separator,
/// drive colon and dot in the path becomes `-` (`C:\a\.b` is `C--a--b`).
pub fn claude_project_slug(cwd: &str) -> String {
    cwd.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '.' => '-',
            c => c,
        })
        .collect()
}

/// A canonical path as people read it: Windows' `\\?\` verbatim prefix (which
/// `std::fs::canonicalize` adds) dropped, so `\\?\C:\pics` is `C:\pics` and
/// `\\?\UNC\host\share` is `\\host\share`.
pub fn plain(path: &str) -> String {
    plain_on(path, WINDOWS)
}

fn plain_on(path: &str, windows: bool) -> String {
    if !windows {
        return path.to_string();
    }
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    path.strip_prefix(r"\\?\").unwrap_or(path).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_drops_the_verbatim_prefix_on_windows() {
        assert_eq!(plain_on(r"\\?\C:\pics\a.png", true), r"C:\pics\a.png");
        assert_eq!(plain_on(r"\\?\UNC\host\share\x", true), r"\\host\share\x");
        assert_eq!(plain_on(r"C:\pics", true), r"C:\pics");
        assert_eq!(plain_on(r"\\?\odd", false), r"\\?\odd");
    }

    #[test]
    fn forward_only_rewrites_on_windows() {
        assert_eq!(forward_on(r"C:\repo\app", true), "C:/repo/app");
        assert_eq!(forward_on(r"odd\name", false), r"odd\name");
    }

    #[test]
    fn basename_handles_both_separators_and_trailing_slashes() {
        assert_eq!(basename_on("/repo/app/", false), "app");
        assert_eq!(basename_on(r"C:\repo\app\", true), "app");
        assert_eq!(basename_on("C:/repo/app", true), "app");
        assert_eq!(basename_on("app", false), "app");
    }

    #[test]
    fn windows_prefixes_ignore_case_and_separator_style() {
        let path = "c:/Repo/.worktrees/one";
        let prefix = r"C:\repo\.worktrees\";
        assert_eq!(strip_prefix_on(path, prefix, true), Some("one"));
        assert_eq!(strip_prefix_on(path, prefix, false), None);
        assert_eq!(strip_prefix_on("short", prefix, true), None);
    }

    #[test]
    fn a_non_ascii_path_cant_split_a_character() {
        assert_eq!(strip_prefix_on("é/a", "x/", true), None);
        assert_eq!(strip_prefix_on("aé", "ab", true), None);
    }

    #[test]
    fn unix_prefixes_stay_exact() {
        let prefix = "/repo/.worktrees/";
        assert_eq!(
            strip_prefix_on("/repo/.worktrees/a", prefix, false),
            Some("a")
        );
        assert_eq!(strip_prefix_on("/REPO/.worktrees/a", prefix, false), None);
    }

    #[test]
    fn claude_slugs_match_on_each_os() {
        assert_eq!(
            claude_project_slug("/Users/ron/trace/.worktrees/a"),
            "-Users-ron-trace--worktrees-a"
        );
        assert_eq!(
            claude_project_slug(r"C:\Users\ron\trace"),
            "C--Users-ron-trace"
        );
        assert_eq!(
            claude_project_slug("C:/Users/ron/trace"),
            "C--Users-ron-trace"
        );
    }
}
