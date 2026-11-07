//! Append-only files (a chat agent's journal): lines added under the file's lock,
//! user-only from creation, and a locked rewrite to compact one.

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use super::lock::FileLock;
use super::{owner_only, write_atomic};

/// Append `line` and a newline to `path`, creating it user-only (and its parent
/// directories). Under the file's lock, so a rewrite can't drop it and two traces'
/// lines never interleave.
pub fn append_line(path: &Path, line: &[u8]) -> Result<(), String> {
    let fail = |e: io::Error| format!("Couldn't append to {}: {e}", path.display());
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(fail)?;
    }
    let _lock = FileLock::acquire(path)?;
    let mut bytes = Vec::with_capacity(line.len() + 1);
    bytes.extend_from_slice(line);
    bytes.push(b'\n');
    let mut file = owner_only()
        .append(true)
        .create(true)
        .open(path)
        .map_err(fail)?;
    // One write, so a crash leaves at most a torn last line, which readers skip.
    file.write_all(&bytes).map_err(fail)
}

/// Replace `path` with what `f` makes of its current bytes, under its lock. `f`
/// returning `None` leaves the file alone. A missing file is empty bytes.
pub fn rewrite(path: &Path, f: impl FnOnce(&[u8]) -> Option<Vec<u8>>) -> Result<(), String> {
    let _lock = FileLock::acquire(path)?;
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(e) => return Err(format!("Couldn't read {}: {e}", path.display())),
    };
    match f(&bytes) {
        Some(next) => write_atomic(path, &next),
        None => Ok(()),
    }
}
