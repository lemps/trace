//! The Files tab for an agent in a sandbox: its checkout's changes, one file's
//! diff, a file's text and the file list, read with git inside the sandbox and
//! handed back in the same shapes the local readers give (`worktree_diff`,
//! `worktree_files`), so the renderer can't tell them apart.
//!
//! Each read is one command (a provider round trip is the slow part), and git's
//! NUL-separated output comes back base64-encoded, one section per line, since
//! a provider's log stream is text.

use base64::Engine;

use super::{ExecOutput, SandboxProvider};
use crate::diff_parse::{parse_unified, FileDiff};
use crate::diff_summary::{parse_raw_numstat, ChangeKind, FileSummary};
use crate::worktree_diff::DiffSummary;
use crate::worktree_files::{parse, WorktreeFiles, MAX_FILES};

/// A checkout in a running sandbox.
pub struct RemoteDir<'a> {
    pub provider: &'a dyn SandboxProvider,
    pub session_id: &'a str,
    /// The repo's folder in the sandbox.
    pub dir: &'a str,
}

/// The base (`origin/<default>`) and what to diff against: the merge-base, so
/// upstream commits the branch lacks don't show as deletions (`worktree_diff`).
const BASE: &str = r#"cd "$1" || exit 2
base=$(git symbolic-ref -q --short refs/remotes/origin/HEAD || echo origin/main)
against=$(git merge-base "$base" HEAD 2>/dev/null || echo "$base")
"#;

/// Line 1 the base, line 2 the raw numstat, line 3 each untracked file and its
/// line count (0 for binary), NUL-separated.
const SUMMARY: &str = r#"printf '%s\n' "$base"
git --literal-pathspecs diff --raw --numstat -z -M "$against" | base64 -w0; echo
git ls-files -z --others --exclude-standard | while IFS= read -r -d '' f; do
  n=0
  if [ -s "$f" ] && grep -Iq . "$f" 2>/dev/null; then n=$(grep -c '' "$f"); fi
  printf '%s\0%s\0' "$f" "$n"
done | base64 -w0; echo
"#;

/// An untracked file diffs against nothing (exit 1 means "differs"); anything
/// else against the merge-base, with a rename's old path alongside.
const FILE_DIFF: &str = r#"if [ -n "$(git --literal-pathspecs ls-files --others --exclude-standard -- "$2")" ]; then
  git diff --no-color --no-index -- /dev/null "$2"; [ $? -le 1 ]; exit
fi
git --literal-pathspecs diff --no-color -M "$against" -- "$2" ${3:+"$3"}
"#;

/// A text file under 1 MiB, or a reason it can't be shown.
const READ: &str = r#"cd "$1" || exit 2
[ -f "$2" ] || { echo "Couldn't read $2: no such file" >&2; exit 3; }
[ "$(stat -c%s -- "$2")" -le 1048576 ] || { echo "File is too large to preview." >&2; exit 3; }
[ ! -s "$2" ] || grep -Iq . -- "$2" || { echo "Not a text file." >&2; exit 3; }
cat -- "$2"
"#;

const LIST: &str = r#"cd "$1" || exit 2
git -c core.quotepath=off ls-files -z --cached --others --exclude-standard | head -z -n "$2" | base64 -w0
"#;

fn argv(script: String, args: &[&str]) -> Vec<String> {
    let mut out = vec![
        "bash".to_string(),
        "-c".to_string(),
        script,
        "trace-files".to_string(),
    ];
    out.extend(args.iter().map(|a| a.to_string()));
    out
}

impl RemoteDir<'_> {
    fn run(&self, script: String, args: &[&str]) -> Result<ExecOutput, String> {
        let mut all = vec![self.dir];
        all.extend(args);
        let out = self
            .provider
            .exec(self.session_id, &argv(script, &all), &Default::default())?;
        if out.ok() {
            return Ok(out);
        }
        let why = out.stderr.trim();
        Err(match why.is_empty() {
            true => "Couldn't read the sandbox's files.".to_string(),
            false => crate::helpers::tail_chars(why, 400),
        })
    }

    pub fn summary(&self) -> Result<DiffSummary, String> {
        let out = self.run(format!("{BASE}{SUMMARY}"), &[])?;
        parse_summary(&out.stdout)
    }

    pub fn file_diff(&self, path: &str, old_path: Option<&str>) -> Result<FileDiff, String> {
        crate::helpers::safe_relative_path(path)?;
        if let Some(old) = old_path {
            crate::helpers::safe_relative_path(old)?;
        }
        let out = self.run(
            format!("{BASE}{FILE_DIFF}"),
            &[path, old_path.unwrap_or("")],
        )?;
        Ok(parse_unified(path, &out.stdout))
    }

    pub fn read(&self, path: &str) -> Result<String, String> {
        crate::helpers::safe_relative_path(path)?;
        Ok(self.run(READ.to_string(), &[path])?.stdout)
    }

    pub fn list(&self) -> Result<WorktreeFiles, String> {
        let limit = (MAX_FILES + 1).to_string();
        let out = self.run(LIST.to_string(), &[&limit])?;
        Ok(parse(&decode(out.stdout.trim())?, MAX_FILES))
    }
}

fn decode(line: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(line.trim())
        .map_err(|_| "The sandbox sent back something unreadable.".to_string())
}

/// The three lines [`SUMMARY`] prints, as a change list.
fn parse_summary(stdout: &str) -> Result<DiffSummary, String> {
    let mut lines = stdout.lines();
    let base = lines.next().unwrap_or("origin/main").trim().to_string();
    let mut files = parse_raw_numstat(&decode(lines.next().unwrap_or(""))?);
    let untracked = decode(lines.next().unwrap_or(""))?;
    let mut fields = untracked.split(|b| *b == 0);
    while let (Some(path), Some(count)) = (fields.next(), fields.next()) {
        if path.is_empty() {
            break;
        }
        files.push(FileSummary {
            path: String::from_utf8_lossy(path).into_owned(),
            add: String::from_utf8_lossy(count).trim().parse().unwrap_or(0),
            del: 0,
            status: ChangeKind::Untracked,
            old_path: None,
        });
    }
    Ok(DiffSummary {
        base,
        files,
        own_worktree: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn a_summary_reads_tracked_and_untracked_changes() {
        let raw = b":100644 100644 aaa bbb M\0src/a.rs\x003\t1\tsrc/a.rs\0";
        let untracked = b"new file.md\x0012\0pic.png\x000\0";
        let out = format!("origin/main\n{}\n{}\n", b64(raw), b64(untracked));
        let s = parse_summary(&out).expect("parsed");
        assert_eq!(s.base, "origin/main");
        assert!(s.own_worktree);
        let paths: Vec<&str> = s.files.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"new file.md"), "{paths:?}");
        let new = s
            .files
            .iter()
            .find(|f| f.path == "new file.md")
            .expect("new");
        assert_eq!((new.add, new.status), (12, ChangeKind::Untracked));
        assert_eq!(
            s.files.iter().find(|f| f.path == "pic.png").map(|f| f.add),
            Some(0)
        );
    }

    #[test]
    fn nothing_changed_is_an_empty_list() {
        let s = parse_summary("origin/main\n\n\n").expect("parsed");
        assert!(s.files.is_empty());
    }

    #[test]
    fn paths_go_in_as_arguments_never_into_the_script() {
        let a = argv(READ.to_string(), &["/vercel/x", "a'; rm -rf /"]);
        assert_eq!(a[..2], ["bash", "-c"]);
        assert!(!a[2].contains("rm -rf"));
        assert_eq!(a[5], "a'; rm -rf /");
    }
}
