//! Every file in a worktree, for Quick Open's fuzzy search.
//!
//! Git already knows the answer, and fast: `git ls-files` reads the index for
//! tracked files and walks only what isn't ignored for new ones, so a big repo's
//! `node_modules/` or `target/` never gets touched, and `.gitignore` is honoured
//! exactly as git honours it.

use serde::Serialize;

/// Past this many paths the list is cut short: fuzzy-ranking more than this on
/// every keystroke would stall the renderer, and no one scrolls that far.
pub const MAX_FILES: usize = 200_000;

/// A worktree's files, relative to its root with `/` separators.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeFiles {
    pub files: Vec<String>,
    /// More files exist than `files` holds (see `MAX_FILES`).
    pub truncated: bool,
}

/// List tracked files plus untracked ones `.gitignore` doesn't exclude.
///
/// `-z` keeps paths verbatim (no C-quoting of spaces or non-ASCII names). An
/// unmerged path is listed once per stage; `parse` drops the repeats (git's own
/// `--deduplicate` needs git 2.31, newer than some Linux distributions ship).
pub fn list(work_dir: &str) -> Result<WorktreeFiles, String> {
    let out = crate::claude::discovery::command("git")
        .args([
            "-c",
            "core.quotepath=off",
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ])
        .current_dir(work_dir)
        .output()
        .map_err(|e| format!("Couldn't run git: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Couldn't list files: {}", err.trim()));
    }
    Ok(parse(&out.stdout, MAX_FILES))
}

/// Split `git ls-files -z` output into distinct paths, keeping at most `cap`.
pub fn parse(stdout: &[u8], cap: usize) -> WorktreeFiles {
    let mut files = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut truncated = false;
    for raw in stdout.split(|b| *b == 0).filter(|p| !p.is_empty()) {
        if !seen.insert(raw) {
            continue;
        }
        if files.len() == cap {
            truncated = true;
            break;
        }
        files.push(String::from_utf8_lossy(raw).into_owned());
    }
    WorktreeFiles { files, truncated }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_nul_separated_paths() {
        let got = parse(
            b"src/a.ts\0dir with space/b.md\0\xc3\xa9t\xc3\xa9.txt\0",
            10,
        );
        assert_eq!(
            got.files,
            vec!["src/a.ts", "dir with space/b.md", "été.txt"]
        );
        assert!(!got.truncated);
    }

    #[test]
    fn lists_an_unmerged_path_once() {
        let got = parse(b"a.rs\0b.rs\0b.rs\0b.rs\0c.rs\0", 10);
        assert_eq!(got.files, vec!["a.rs", "b.rs", "c.rs"]);
    }

    #[test]
    fn caps_the_list_and_says_so() {
        let got = parse(b"a\0b\0c\0", 2);
        assert_eq!(got.files, vec!["a", "b"]);
        assert!(got.truncated);
        assert!(!parse(b"a\0b\0", 2).truncated);
    }

    #[test]
    fn lists_tracked_and_new_files_but_not_ignored_ones() {
        let dir = std::env::temp_dir().join(format!("trace-files-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        std::fs::create_dir_all(dir.join("build")).unwrap();
        let git = |args: &[&str]| {
            let ok = crate::claude::discovery::command("git")
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap()
                .status
                .success();
            assert!(ok, "git {args:?}");
        };
        git(&["init", "-q"]);
        std::fs::write(dir.join(".gitignore"), "build/\n").unwrap();
        std::fs::write(dir.join("src/main.rs"), "fn main() {}").unwrap();
        std::fs::write(dir.join("build/out.bin"), "x").unwrap();
        git(&["add", ".gitignore", "src/main.rs"]);
        std::fs::write(dir.join("notes.md"), "new").unwrap();

        let mut got = list(dir.to_str().unwrap()).unwrap().files;
        got.sort();
        assert_eq!(got, vec![".gitignore", "notes.md", "src/main.rs"]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
