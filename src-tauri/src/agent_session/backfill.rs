//! Bringing a chat agent's journal up to date with its conversation's turns
//! taken outside a chat run (the terminal, before a switch to chat or between
//! two chat runs), so the chat shows the whole conversation, as the terminal's
//! `--resume` does. The rows come from `claude::history`; they're placed among
//! the journal's own rows by when they happened, and every row is renumbered,
//! in one locked rewrite of the journal. Rows already there (by id) are left be,
//! so this is cheap to repeat: it runs when a view reads the journal and when a
//! chat agent starts, never while one runs (it would renumber under it).

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::journal::JournalRow;
use super::store;
use crate::helpers::persist;

/// Add `workspace_id`'s missing conversation turns to its journal. `cwd`, when
/// known, finds the conversation without a search. The journal's rows when it
/// changed; None when nothing was missing (or there's no Claude conversation).
pub fn sync(workspace_id: &str, cwd: Option<&str>) -> Result<Option<Vec<JournalRow>>, String> {
    let Some(conversation) =
        crate::claude::conversations::saved_conversation_file(workspace_id, cwd)
    else {
        return Ok(None);
    };
    let journal = store::journal_path(workspace_id);
    // Conversations only grow: one no longer than at the last sync has nothing
    // new, and a long one isn't worth reading again (a view's read, then Start).
    let len = std::fs::metadata(&conversation).map_or(0, |m| m.len());
    let seen = (conversation.clone(), len);
    if synced().lock().ok().and_then(|m| m.get(&journal).cloned()) == Some(seen.clone()) {
        return Ok(None);
    }
    let changed = sync_from(&journal, &conversation)?;
    if let Ok(mut map) = synced().lock() {
        map.insert(journal, seen);
    }
    Ok(changed)
}

/// Each journal's conversation, and its length, when they were last synced.
fn synced() -> &'static Mutex<HashMap<PathBuf, (PathBuf, u64)>> {
    static SYNCED: OnceLock<Mutex<HashMap<PathBuf, (PathBuf, u64)>>> = OnceLock::new();
    SYNCED.get_or_init(Mutex::default)
}

fn sync_from(journal: &Path, conversation: &Path) -> Result<Option<Vec<JournalRow>>, String> {
    let history = super::claude::history::rows(conversation);
    if history.is_empty() {
        return Ok(None);
    }
    if let Some(dir) = journal.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut changed = None;
    persist::rewrite(journal, |bytes| {
        let rows = store::parse(bytes);
        let have: HashSet<&str> = rows.iter().map(|r| r.id.as_str()).collect();
        let missing: Vec<JournalRow> = history
            .into_iter()
            .filter(|r| !have.contains(r.id.as_str()))
            .collect();
        if missing.is_empty() {
            return None;
        }
        let merged = merge(rows, missing);
        let lines = store::to_lines(&merged);
        changed = Some(merged);
        Some(lines)
    })?;
    Ok(changed)
}

/// `rows` (in `seq` order) and `history` (oldest first) as one list by time,
/// a journal row first on a tie, then numbered from 0.
fn merge(rows: Vec<JournalRow>, history: Vec<JournalRow>) -> Vec<JournalRow> {
    let mut rows: VecDeque<JournalRow> = rows.into();
    let mut history: VecDeque<JournalRow> = history.into();
    let mut out = Vec::with_capacity(rows.len() + history.len());
    loop {
        let take_history = match (rows.front(), history.front()) {
            (Some(row), Some(old)) => old.at < row.at,
            (None, Some(_)) => true,
            (_, None) => false,
        };
        let next = if take_history {
            history.pop_front()
        } else {
            rows.pop_front()
        };
        let Some(mut row) = next else { break };
        row.seq = out.len() as u64;
        out.push(row);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::journal::{JournalBody, Message, Role};

    fn row(id: &str, seq: u64, at: u64) -> JournalRow {
        JournalRow {
            id: id.into(),
            revision: 0,
            seq,
            at,
            turn_id: None,
            body: JournalBody::Message(Message {
                role: Role::User,
                text: id.into(),
                streaming: false,
                parent_call_id: None,
                attachments: Vec::new(),
            }),
        }
    }

    fn ids(rows: &[JournalRow]) -> Vec<&str> {
        rows.iter().map(|r| r.id.as_str()).collect()
    }

    #[test]
    fn history_goes_where_it_happened_and_every_row_is_renumbered() {
        // Chat, then terminal turns, then chat again.
        let rows = vec![row("chat1", 0, 10), row("chat2", 1, 50)];
        let history = vec![row("term1", 0, 5), row("term2", 0, 20), row("term3", 0, 30)];
        let merged = merge(rows, history);
        assert_eq!(ids(&merged), ["term1", "chat1", "term2", "term3", "chat2"]);
        let seqs: Vec<u64> = merged.iter().map(|r| r.seq).collect();
        assert_eq!(seqs, [0, 1, 2, 3, 4]);
    }

    #[test]
    fn a_second_sync_adds_nothing_and_new_terminal_turns_join_later() {
        let dir = std::env::temp_dir().join(format!("trace-backfill-{}", crate::helpers::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let journal = dir.join("journals").join("ws.jsonl");
        let conversation = dir.join("c.jsonl");
        let turn = |uuid: &str, at: &str, text: &str| {
            format!(
                r#"{{"type":"user","entrypoint":"cli","uuid":"{uuid}","timestamp":"{at}","message":{{"role":"user","content":"{text}"}}}}"#
            ) + "\n"
        };
        std::fs::write(&conversation, turn("u1", "2026-11-06T09:00:00Z", "one")).unwrap();
        store::append(&journal, &row("chat", 0, 1_900_000_000_000)).unwrap();

        let first = sync_from(&journal, &conversation).unwrap().unwrap();
        assert_eq!(ids(&first), ["hist:user:u1", "turn:hist-u1", "chat"]);
        assert!(sync_from(&journal, &conversation).unwrap().is_none());

        let more =
            turn("u1", "2026-11-06T09:00:00Z", "one") + &turn("u2", "2026-11-07T09:00:00Z", "two");
        std::fs::write(&conversation, more).unwrap();
        let second = sync_from(&journal, &conversation).unwrap().unwrap();
        assert_eq!(
            ids(&second),
            [
                "hist:user:u1",
                "turn:hist-u1",
                "hist:user:u2",
                "turn:hist-u2",
                "chat"
            ]
        );
        assert_eq!(store::load(&journal).unwrap(), second);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
