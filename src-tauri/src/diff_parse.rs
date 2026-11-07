//! Parse `git diff` output for one file into hunks for the Files tab's diff viewer.

use serde::Serialize;

/// One line of a hunk, with its number on each side (absent where it doesn't exist).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// "ctx" (context) | "add" | "del"
    pub kind: String,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    pub text: String,
}

/// One `@@` block of a file's diff.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

/// A file's whole diff: its line counts and hunks.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub add: u32,
    pub del: u32,
    pub hunks: Vec<Hunk>,
}

/// Parse the standard `git diff` output for a single file into structured hunks.
/// Pre-hunk metadata lines (`diff --git`, `index`, `---`, `+++`) are skipped.
pub fn parse_unified(path: &str, text: &str) -> FileDiff {
    let mut hunks: Vec<Hunk> = Vec::new();
    let mut add = 0u32;
    let mut del = 0u32;
    let mut current: Option<Hunk> = None;
    let mut old_no = 0u32;
    let mut new_no = 0u32;

    for line in text.lines() {
        if line.starts_with("@@") {
            if let Some(h) = current.take() {
                hunks.push(h);
            }
            let (a, b) = parse_hunk_header(line);
            old_no = a;
            new_no = b;
            current = Some(Hunk {
                header: line.to_string(),
                lines: Vec::new(),
            });
            continue;
        }

        let Some(h) = current.as_mut() else {
            continue; // pre-hunk metadata
        };

        // No `+++`/`---` guards here: for a single-file diff that metadata only
        // appears before the first `@@` (already skipped above), and guarding
        // inside hunks drops real content lines that start with "++"/"--".
        if let Some(rest) = line.strip_prefix('+') {
            h.lines.push(DiffLine {
                kind: "add".into(),
                old_no: None,
                new_no: Some(new_no),
                text: rest.to_string(),
            });
            new_no += 1;
            add += 1;
        } else if let Some(rest) = line.strip_prefix('-') {
            h.lines.push(DiffLine {
                kind: "del".into(),
                old_no: Some(old_no),
                new_no: None,
                text: rest.to_string(),
            });
            old_no += 1;
            del += 1;
        } else if let Some(rest) = line.strip_prefix(' ') {
            h.lines.push(DiffLine {
                kind: "ctx".into(),
                old_no: Some(old_no),
                new_no: Some(new_no),
                text: rest.to_string(),
            });
            old_no += 1;
            new_no += 1;
        }
        // `\ No newline at end of file` and similar — drop.
    }
    if let Some(h) = current.take() {
        hunks.push(h);
    }

    FileDiff {
        path: path.to_string(),
        add,
        del,
        hunks,
    }
}

/// `@@ -a,b +c,d @@ ...` → (a, c). Defaults to (1, 1) on malformed input.
fn parse_hunk_header(line: &str) -> (u32, u32) {
    let mut old_start = 1u32;
    let mut new_start = 1u32;
    for token in line.split_whitespace() {
        if let Some(rest) = token.strip_prefix('-') {
            old_start = rest
                .split(',')
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(1);
        } else if let Some(rest) = token.strip_prefix('+') {
            new_start = rest
                .split(',')
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(1);
        }
    }
    (old_start, new_start)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hunk_header_starts() {
        assert_eq!(parse_hunk_header("@@ -10,6 +12,8 @@ fn main()"), (10, 12));
        assert_eq!(parse_hunk_header("@@ -0,0 +1,3 @@"), (0, 1));
        assert_eq!(parse_hunk_header("@@ garbage @@"), (1, 1));
    }

    #[test]
    fn parses_mixed_hunk_with_line_numbers() {
        let text = "diff --git a/f b/f\nindex 111..222 100644\n--- a/f\n+++ b/f\n@@ -1,3 +1,3 @@\n ctx1\n-old\n+new\n ctx2\n";
        let fd = parse_unified("f", text);
        assert_eq!(fd.add, 1);
        assert_eq!(fd.del, 1);
        assert_eq!(fd.hunks.len(), 1);
        let lines = &fd.hunks[0].lines;
        assert_eq!(lines[0].kind, "ctx");
        assert_eq!((lines[0].old_no, lines[0].new_no), (Some(1), Some(1)));
        assert_eq!(lines[1].kind, "del");
        assert_eq!((lines[1].old_no, lines[1].new_no), (Some(2), None));
        assert_eq!(lines[2].kind, "add");
        assert_eq!((lines[2].old_no, lines[2].new_no), (None, Some(2)));
        assert_eq!((lines[3].old_no, lines[3].new_no), (Some(3), Some(3)));
    }

    #[test]
    fn keeps_content_lines_starting_with_plus_plus_or_minus_minus() {
        // Regression: the old +++/--- guards inside hunks ate these.
        let text = "@@ -0,0 +1,2 @@\n+--strip-flag removed\n+++plus line\n";
        let fd = parse_unified("f", text);
        assert_eq!(fd.add, 2);
        assert_eq!(fd.hunks[0].lines[0].text, "--strip-flag removed");
        assert_eq!(fd.hunks[0].lines[1].text, "++plus line");
    }

    #[test]
    fn skips_metadata_and_no_newline_marker() {
        let text = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n";
        let fd = parse_unified("f", text);
        assert_eq!(fd.hunks[0].lines.len(), 2);
        assert_eq!((fd.add, fd.del), (1, 1));
    }

    #[test]
    fn multiple_hunks() {
        let text = "@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +10,1 @@\n-c\n+d\n";
        let fd = parse_unified("f", text);
        assert_eq!(fd.hunks.len(), 2);
        assert_eq!(fd.hunks[1].lines[0].old_no, Some(10));
    }
}
