//! The Files tab's change list: which paths differ from the base, how (added,
//! modified, deleted, renamed), and by how many lines.
//!
//! One `git diff --raw --numstat -z -M` gives both halves: the raw records carry
//! each path's status letter, the numstat records its line counts. `-z` keeps
//! paths verbatim, so a rename is two plain paths rather than numstat's
//! `src/{a => b}.ts` shorthand, which no file is actually called.

use serde::Serialize;

/// How a path differs from the base.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    /// New and not yet known to git: `git diff` never reports these.
    Untracked,
}

/// One changed path for the file tree.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileSummary {
    /// Where the file is now (a deleted file's last path).
    pub path: String,
    pub add: u32,
    pub del: u32,
    pub status: ChangeKind,
    /// A renamed file's path in the base.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

fn kind_of(letter: u8) -> ChangeKind {
    match letter {
        b'A' => ChangeKind::Added,
        b'D' => ChangeKind::Deleted,
        // A copy is a new path made from an old one: closest to a rename for the tree.
        b'R' | b'C' => ChangeKind::Renamed,
        _ => ChangeKind::Modified,
    }
}

fn text(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw).into_owned()
}

/// Parse `git diff --raw --numstat -z` output: first a raw record per path
/// (`:<modes> <shas> <STATUS>\0<path>\0`, two paths for a rename or copy), then a
/// numstat record per path (`<add>\t<del>\t<path>\0`, or `<add>\t<del>\t\0<old>\0<new>\0`).
/// A binary file's counts are `-`, read as 0.
pub fn parse_raw_numstat(stdout: &[u8]) -> Vec<FileSummary> {
    let mut tokens = stdout.split(|b| *b == 0).filter(|t| !t.is_empty());
    let mut files: Vec<FileSummary> = Vec::new();
    let mut index = std::collections::HashMap::new();
    while let Some(token) = tokens.next() {
        if token.first() == Some(&b':') {
            let letter = token.rsplit(|b| *b == b' ').next().and_then(|s| s.first());
            let kind = kind_of(letter.copied().unwrap_or(b'M'));
            let Some(first) = tokens.next() else { break };
            let (path, old_path) = if kind == ChangeKind::Renamed {
                let Some(second) = tokens.next() else { break };
                (text(second), Some(text(first)))
            } else {
                (text(first), None)
            };
            index.insert(path.clone(), files.len());
            files.push(FileSummary {
                path,
                add: 0,
                del: 0,
                status: kind,
                old_path,
            });
            continue;
        }
        let mut fields = token.splitn(3, |b| *b == b'\t');
        let add = fields.next().map(text).unwrap_or_default();
        let del = fields.next().map(text).unwrap_or_default();
        let path = match fields.next() {
            Some(p) if !p.is_empty() => text(p),
            // A rename's numstat names both paths in the next two tokens.
            _ => {
                let _old = tokens.next();
                match tokens.next() {
                    Some(p) => text(p),
                    None => break,
                }
            }
        };
        let (add, del) = (add.parse().unwrap_or(0), del.parse().unwrap_or(0));
        match index.get(&path) {
            Some(&i) => {
                files[i].add = add;
                files[i].del = del;
            }
            // No raw record (shouldn't happen): still list it, as a modification.
            None => {
                index.insert(path.clone(), files.len());
                files.push(FileSummary {
                    path,
                    add,
                    del,
                    status: ChangeKind::Modified,
                    old_path: None,
                });
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b":100644 100644 621b006 0000000 M\0LICENSE\0");
        out.extend_from_slice(b":100644 100644 bf7a50c bf7a50c R100\0README.md\0docs/README2.md\0");
        out.extend_from_slice(b":100644 000000 03e313d 0000000 D\0biome.json\0");
        out.extend_from_slice(b":000000 100644 0000000 1234567 A\0dir with space/\xc3\xa9.png\0");
        out.extend_from_slice(b"1\t0\tLICENSE\0");
        out.extend_from_slice(b"2\t1\t\0README.md\0docs/README2.md\0");
        out.extend_from_slice(b"0\t35\tbiome.json\0");
        out.extend_from_slice(b"-\t-\tdir with space/\xc3\xa9.png\0");
        out
    }

    #[test]
    fn reads_status_and_counts_for_each_path() {
        let got = parse_raw_numstat(&sample());
        let row = |p: &str| got.iter().find(|f| f.path == p).cloned().unwrap();
        assert_eq!(got.len(), 4);
        assert_eq!(row("LICENSE").status, ChangeKind::Modified);
        assert_eq!((row("LICENSE").add, row("LICENSE").del), (1, 0));
        assert_eq!(row("biome.json").status, ChangeKind::Deleted);
        assert_eq!(row("biome.json").del, 35);
    }

    #[test]
    fn a_rename_is_listed_at_its_new_path_with_the_old_one_kept() {
        let got = parse_raw_numstat(&sample());
        let renamed = got
            .iter()
            .find(|f| f.status == ChangeKind::Renamed)
            .unwrap();
        assert_eq!(renamed.path, "docs/README2.md");
        assert_eq!(renamed.old_path.as_deref(), Some("README.md"));
        assert_eq!((renamed.add, renamed.del), (2, 1));
    }

    #[test]
    fn binary_files_and_odd_names_survive() {
        let got = parse_raw_numstat(&sample());
        let image = got.iter().find(|f| f.status == ChangeKind::Added).unwrap();
        assert_eq!(image.path, "dir with space/é.png");
        assert_eq!((image.add, image.del), (0, 0));
    }

    #[test]
    fn empty_output_is_no_changes() {
        assert!(parse_raw_numstat(b"").is_empty());
    }
}
