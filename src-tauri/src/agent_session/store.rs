//! A chat agent's journal on disk: `<config dir>/journals/<workspace id>.jsonl`,
//! one row revision per line, appended user-only through `helpers::persist`.
//! Loading keeps each id's highest revision, in order of first appearance.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::journal::JournalRow;
use crate::helpers::persist;

/// Where `workspace_id`'s journal lives.
pub fn journal_path(workspace_id: &str) -> PathBuf {
    crate::helpers::trace_dir()
        .join("journals")
        .join(format!("{}.jsonl", file_stem(workspace_id)))
}

/// A file name for any workspace id. Ids like `sched:<id>` hold characters a
/// Windows file name can't, so anything but `[A-Za-z0-9_-]` becomes `_`, and a
/// hash of the real id keeps two ids that map alike apart.
pub(crate) fn file_stem(workspace_id: &str) -> String {
    let safe: String = workspace_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if safe == workspace_id && !safe.is_empty() {
        return safe;
    }
    // FNV-1a: stable across builds, unlike std's hasher.
    let hash = workspace_id
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
            (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
        });
    format!("{safe}-{hash:016x}")
}

/// Add one revision of a row.
pub fn append(path: &Path, row: &JournalRow) -> Result<(), String> {
    let line = serde_json::to_vec(row).map_err(|e| e.to_string())?;
    persist::append_line(path, &line)
}

/// Every row's latest revision, in `seq` order. A missing journal is empty.
pub fn load(path: &Path) -> Result<Vec<JournalRow>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(latest(&bytes).0),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Couldn't read {}: {e}", path.display())),
    }
}

/// [`load`], first rewriting the file without superseded revisions when they
/// outnumber the rows: a long conversation's tools and prompts each leave a few.
pub fn load_compacted(path: &Path) -> Result<Vec<JournalRow>, String> {
    let mut rows = Vec::new();
    persist::rewrite(path, |bytes| {
        let (kept, lines) = latest(bytes);
        let rewrite = lines > kept.len() * 2 + 16;
        let next = rewrite.then(|| to_lines(&kept));
        rows = kept;
        next
    })?;
    Ok(rows)
}

/// The `seq` a new row continues from.
pub fn next_seq(rows: &[JournalRow]) -> u64 {
    rows.iter().map(|r| r.seq + 1).max().unwrap_or(0)
}

/// The latest revision of each row, and how many lines were read. Lines that
/// don't parse (a torn last line after a crash, a newer trace's row kind) are
/// skipped rather than failing the whole journal.
fn latest(bytes: &[u8]) -> (Vec<JournalRow>, usize) {
    let mut by_id: HashMap<String, JournalRow> = HashMap::new();
    let mut lines = 0;
    for line in bytes.split(|b| *b == b'\n') {
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        lines += 1;
        let Ok(row) = serde_json::from_slice::<JournalRow>(line) else {
            continue;
        };
        match by_id.get(&row.id) {
            Some(held) if held.revision > row.revision => {}
            _ => {
                by_id.insert(row.id.clone(), row);
            }
        }
    }
    let mut rows: Vec<JournalRow> = by_id.into_values().collect();
    rows.sort_by_key(|r| r.seq);
    (rows, lines)
}

fn to_lines(rows: &[JournalRow]) -> Vec<u8> {
    let mut out = Vec::new();
    for row in rows {
        if let Ok(line) = serde_json::to_vec(row) {
            out.extend_from_slice(&line);
            out.push(b'\n');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::journal::{JournalBody, Message, Role};

    fn row(id: &str, revision: u32, seq: u64, text: &str) -> JournalRow {
        JournalRow {
            id: id.into(),
            revision,
            seq,
            at: 0,
            turn_id: None,
            body: JournalBody::Message(Message {
                role: Role::Assistant,
                text: text.into(),
                streaming: false,
                parent_call_id: None,
            }),
        }
    }

    fn temp_journal() -> PathBuf {
        std::env::temp_dir()
            .join(format!("trace-journal-{}", crate::helpers::new_id()))
            .join("j.jsonl")
    }

    fn text(row: &JournalRow) -> &str {
        match &row.body {
            JournalBody::Message(m) => &m.text,
            _ => "",
        }
    }

    #[test]
    fn load_keeps_each_ids_highest_revision_in_seq_order() {
        let path = temp_journal();
        append(&path, &row("b", 0, 1, "b0")).unwrap();
        append(&path, &row("a", 0, 0, "a0")).unwrap();
        append(&path, &row("b", 2, 1, "b2")).unwrap();
        // A late, lower revision never wins over a higher one.
        append(&path, &row("b", 1, 1, "b1")).unwrap();
        let rows = load(&path).unwrap();
        let got: Vec<(&str, u32, &str)> = rows
            .iter()
            .map(|r| (r.id.as_str(), r.revision, text(r)))
            .collect();
        assert_eq!(got, vec![("a", 0, "a0"), ("b", 2, "b2")]);
        assert_eq!(next_seq(&rows), 2);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn a_missing_journal_is_empty_and_a_torn_line_is_skipped() {
        let path = temp_journal();
        assert!(load(&path).unwrap().is_empty());
        append(&path, &row("a", 0, 0, "a0")).unwrap();
        persist::append_line(&path, br#"{"id":"b","revis"#).unwrap();
        assert_eq!(load(&path).unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn compaction_drops_superseded_revisions_and_keeps_the_rows() {
        let path = temp_journal();
        for revision in 0..40 {
            append(&path, &row("a", revision, 0, &format!("a{revision}"))).unwrap();
        }
        append(&path, &row("b", 0, 1, "b0")).unwrap();
        let rows = load_compacted(&path).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(text(&rows[0]), "a39");
        let lines = std::fs::read_to_string(&path).unwrap().lines().count();
        assert_eq!(lines, 2);
        assert_eq!(load(&path).unwrap(), rows);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn file_names_are_safe_and_distinct() {
        assert_eq!(file_stem("TRACE-12"), "TRACE-12");
        let a = file_stem("sched:1");
        let b = file_stem("sched_1");
        assert!(a.starts_with("sched_1-") && a != b);
        assert!(!file_stem("../x").contains('.'));
    }
}
