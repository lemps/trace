//! Reading Conductor's database without ever opening the user's file.
//!
//! The live `conductor.db` has a WAL and may belong to a running Conductor, so it's
//! copied into a fresh private temp directory (0700, deleted afterwards) and that
//! copy is opened read-only and `immutable`. Conductor's schema has gone through
//! ~90 migrations, so columns are looked up by name and missing ones skipped.
//! The `settings` rows that hold secrets (`claude_env_vars`, `conductor_api_token`)
//! are never selected: settings are read by an allow-list of keys.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};

/// One row, by column name. NULLs and blobs are left out.
pub type Row = HashMap<String, String>;

/// The tables the import reads.
#[derive(Debug, Default)]
pub struct Snapshot {
    pub repos: Vec<Row>,
    pub workspaces: Vec<Row>,
    pub sessions: Vec<Row>,
    /// Only the keys in [`SAFE_SETTINGS`].
    pub settings: HashMap<String, String>,
}

const REPO_COLUMNS: &[&str] = &[
    "id",
    "name",
    "root_path",
    "remote_url",
    "default_branch",
    "storage_version",
    "hidden",
    "setup_script",
    "run_script",
    "archive_script",
    "run_script_mode",
    "display_order",
    "custom_prompt_general",
    "custom_prompt_create_pr",
    "custom_prompt_code_review",
    "custom_prompt_fix_errors",
    "custom_prompt_resolve_merge_conflicts",
    "custom_prompt_rename_branch",
];

const WORKSPACE_COLUMNS: &[&str] = &[
    "id",
    "repository_id",
    "directory_name",
    "branch",
    "state",
    "active_session_id",
    "updated_at",
];

const SESSION_COLUMNS: &[&str] = &[
    "id",
    "workspace_id",
    "claude_session_id",
    "title",
    "model",
    "permission_mode",
    "agent_type",
    "is_hidden",
    "updated_at",
];

/// The only `settings` keys ever read. Everything else there stays unread —
/// in particular the two that hold credentials.
pub const SAFE_SETTINGS: &[&str] = &[
    "default_model",
    "default_open_in",
    "default_permission_mode",
];

/// Copy `db` somewhere private, read it, and delete the copy.
pub fn read(db: &Path) -> Result<Snapshot, String> {
    // `tempfile` makes the directory 0700 on Unix, and removes it on drop.
    let dir = tempfile::Builder::new()
        .prefix("trace-conductor-")
        .tempdir()
        .map_err(|e| format!("Couldn't make a temporary folder: {e}"))?;
    let copy = dir.path().join("conductor.db");
    std::fs::copy(db, &copy).map_err(|e| format!("Couldn't copy Conductor's database: {e}"))?;
    let snapshot = read_copy(&copy);
    // `read_copy` has closed its connection; now the copy goes.
    let _ = dir.close();
    snapshot
}

fn read_copy(copy: &Path) -> Result<Snapshot, String> {
    let conn =
        open_immutable(copy).map_err(|e| format!("Couldn't open Conductor's database: {e}"))?;
    let err = |e: rusqlite::Error| format!("Couldn't read Conductor's database: {e}");
    Ok(Snapshot {
        repos: rows(&conn, "repos", REPO_COLUMNS).map_err(err)?,
        workspaces: rows(&conn, "workspaces", WORKSPACE_COLUMNS).map_err(err)?,
        sessions: rows(&conn, "sessions", SESSION_COLUMNS).map_err(err)?,
        settings: safe_settings(&conn).map_err(err)?,
    })
}

/// Open read-only, and as immutable: SQLite then takes no locks and never
/// looks for (or writes) a WAL or shared-memory file beside it.
fn open_immutable(path: &Path) -> rusqlite::Result<Connection> {
    let uri = format!("file:{}?immutable=1", uri_path(path));
    Connection::open_with_flags(
        uri,
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

/// `path` as a `file:` URI path: forward slashes, a leading `/` before a
/// Windows drive, and the characters a URI gives meaning to escaped.
fn uri_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut out = if raw.starts_with('/') {
        String::new()
    } else {
        "/".to_string()
    };
    for c in raw.chars() {
        match c {
            '%' => out.push_str("%25"),
            '?' => out.push_str("%3f"),
            '#' => out.push_str("%23"),
            c => out.push(c),
        }
    }
    out
}

/// The columns `table` has; empty when the table doesn't exist.
fn columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT name FROM pragma_table_info(?1)")?;
    let names = stmt.query_map([table], |r| r.get::<_, String>(0))?;
    names.collect()
}

/// Every row of `table`, with whichever of `wanted` it has.
fn rows(conn: &Connection, table: &str, wanted: &[&str]) -> rusqlite::Result<Vec<Row>> {
    let have = columns(conn, table)?;
    let cols: Vec<&str> = wanted
        .iter()
        .copied()
        .filter(|c| have.iter().any(|h| h == c))
        .collect();
    if cols.is_empty() {
        return Ok(Vec::new());
    }
    // Names come from the lists above and were just checked against the table.
    let list = cols
        .iter()
        .map(|c| format!("\"{c}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let mut stmt = conn.prepare(&format!("SELECT {list} FROM \"{table}\""))?;
    let mapped = stmt.query_map([], |r| {
        let mut row = Row::new();
        for (i, col) in cols.iter().enumerate() {
            if let Some(v) = text(r.get_ref(i)?) {
                row.insert((*col).to_string(), v);
            }
        }
        Ok(row)
    })?;
    mapped.collect()
}

fn text(v: ValueRef<'_>) -> Option<String> {
    match v {
        ValueRef::Null | ValueRef::Blob(_) => None,
        ValueRef::Integer(i) => Some(i.to_string()),
        ValueRef::Real(f) => Some(f.to_string()),
        ValueRef::Text(t) => Some(String::from_utf8_lossy(t).into_owned()),
    }
}

/// The allow-listed settings, selected by key so no other row is ever read.
fn safe_settings(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
    let have = columns(conn, "settings")?;
    if !["key", "value"].iter().all(|c| have.iter().any(|h| h == c)) {
        return Ok(HashMap::new());
    }
    let marks = vec!["?"; SAFE_SETTINGS.len()].join(", ");
    let sql = format!("SELECT key, value FROM settings WHERE key IN ({marks})");
    let mut stmt = conn.prepare(&sql)?;
    let pairs = stmt.query_map(rusqlite::params_from_iter(SAFE_SETTINGS), |r| {
        Ok((r.get::<_, String>(0)?, text(r.get_ref(1)?)))
    })?;
    let mut out = HashMap::new();
    for pair in pairs {
        if let (key, Some(value)) = pair? {
            out.insert(key, value);
        }
    }
    Ok(out)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A small Conductor-shaped database: an older schema (no `hidden`, no
    /// custom prompts), plus secret settings that must never come back.
    pub(crate) fn fixture(dir: &Path) -> std::path::PathBuf {
        let path = dir.join("conductor.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE repos (id TEXT, name TEXT, root_path TEXT, storage_version INTEGER,
                setup_script TEXT, run_script TEXT, DEPRECATED_x TEXT);
             CREATE TABLE workspaces (id TEXT, repository_id TEXT, directory_name TEXT,
                state TEXT, active_session_id TEXT);
             CREATE TABLE settings (key TEXT, value TEXT);
             INSERT INTO repos VALUES ('r1', 'app', '/src/app', 3, 'pnpm i', NULL, 'old');
             INSERT INTO workspaces VALUES ('w1', 'r1', 'lima', 'ready', 's1');
             INSERT INTO settings VALUES ('default_model', 'opus'),
                ('claude_env_vars', 'AWS_SECRET_ACCESS_KEY=nope'),
                ('conductor_api_token', 'nope');",
        )
        .unwrap();
        path
    }

    #[test]
    fn reads_by_column_name_and_never_the_secrets() {
        let dir = tempfile::tempdir().unwrap();
        let db = fixture(dir.path());
        let before = std::fs::read(&db).unwrap();
        let snap = read(&db).unwrap();

        assert_eq!(snap.repos.len(), 1);
        let repo = &snap.repos[0];
        assert_eq!(repo["root_path"], "/src/app");
        assert_eq!(repo["storage_version"], "3");
        assert!(!repo.contains_key("run_script"), "NULL is left out");
        assert!(!repo.contains_key("hidden"), "missing columns are skipped");
        assert!(
            !repo.contains_key("DEPRECATED_x"),
            "unasked columns aren't read"
        );
        assert_eq!(snap.workspaces[0]["directory_name"], "lima");
        assert!(snap.sessions.is_empty(), "a missing table reads as empty");
        assert_eq!(snap.settings.len(), 1);
        assert_eq!(snap.settings["default_model"], "opus");
        assert!(!format!("{snap:?}").contains("nope"));
        assert_eq!(
            std::fs::read(&db).unwrap(),
            before,
            "the source is untouched"
        );
        assert!(!dir.path().join("conductor.db-wal").exists());
    }

    #[test]
    fn uri_paths_escape_what_a_uri_means() {
        assert_eq!(uri_path(Path::new("/tmp/a?b#c%d")), "/tmp/a%3fb%23c%25d");
        assert_eq!(uri_path(Path::new(r"C:\t\c.db")), "/C:/t/c.db");
    }
}
