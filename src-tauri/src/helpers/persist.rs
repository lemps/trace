//! How trace's small state files in the config dir get read and written.
//!
//! - **Writes are atomic and `0600` from creation** (`atomic`): a crash leaves the old
//!   file or the new one, never half of one, and a secret is never world-readable,
//!   not even briefly.
//! - **Reads tell apart what the old `.ok().unwrap_or_default()` lumped together:**
//!   a missing file is the default; a corrupt one is moved aside to
//!   `<name>.corrupt-<time>` and then the default; anything else is an error, so a
//!   failed read can't become an empty value that the next save writes back.
//! - **Updates are serialized across threads and processes** (`lock`), because the
//!   installed and dev builds often run together.
//!
//! File contents are plain JSON with no envelope, so an older trace reads them too.
//! An older trace doesn't take the lock, though, and writes in place: its updates can
//! still collide with ours, and a read here can catch one half-written (see `SETTLE`).
//!
//! Plain reads take no lock: a rename means they always see a whole file.

mod append;
mod atomic;
mod gate;
mod lock;

use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::error::Category;

use super::restrict_perms;
use lock::FileLock;

pub use append::{append_line, rewrite};
pub use atomic::write_atomic;
pub use gate::LoadGate;

/// Before calling a file corrupt, give a torn write time to finish. An older trace
/// truncates and rewrites in place, so a read can land mid-write. Moving that file
/// aside would also send the rest of its write to the quarantined copy.
const SETTLE: Duration = Duration::from_millis(100);

/// The JSON layout, per file. Readers don't care; it's kept so the bytes on disk stay
/// exactly what each site has always written.
#[derive(Clone, Copy)]
pub enum Style {
    Compact,
    Pretty,
}

fn to_bytes<T: Serialize>(value: &T, style: Style) -> Result<Vec<u8>, String> {
    match style {
        Style::Compact => serde_json::to_vec(value),
        Style::Pretty => serde_json::to_vec_pretty(value),
    }
    .map_err(|e| e.to_string())
}

/// `<path><suffix>`, a neighbour of `path`.
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = OsString::from(path.as_os_str());
    name.push(suffix);
    PathBuf::from(name)
}

/// Options that create a file user-only from its first instant.
fn owner_only() -> OpenOptions {
    use crate::platform::{ports::PrivateFiles, Os};
    Os::owner_only_options()
}

/// Delete `path` and the lock file [`update`] leaves beside it (best-effort: a file
/// that's already gone is fine).
pub fn remove(path: &Path) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(sibling(path, ".lock"));
}

/// [`write_atomic`] for a JSON value.
pub fn write_json<T: Serialize>(path: &Path, style: Style, value: &T) -> Result<(), String> {
    write_atomic(path, &to_bytes(value, style)?)
}

// ---- safe reads ------------------------------------------------------------

enum Parsed<T> {
    Missing,
    Value(T),
    Corrupt,
}

/// Bytes, not a string: invalid UTF-8 is corruption, where `read_to_string` would
/// report it as an IO error. Error text is built from the position only, because
/// serde's own messages can quote the file, and the file may hold a token.
fn parse<T: DeserializeOwned>(path: &Path) -> Result<Parsed<T>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Parsed::Missing),
        Err(e) => return Err(format!("Couldn't read {}: {e}", path.display())),
    };
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(Parsed::Value(value)),
        // Well-formed JSON of a shape this build doesn't know is most likely from a
        // newer trace running beside this one, not damage. Moving it aside would pull
        // a live file out from under that trace, so it's left alone and writes refuse.
        Err(e) if e.classify() == Category::Data => Err(format!(
            "{} doesn't match what this version of trace expects (line {}, column {}). \
             It was left untouched.",
            path.display(),
            e.line(),
            e.column()
        )),
        Err(_) => Ok(Parsed::Corrupt),
    }
}

/// Move a corrupt file to `<name>.corrupt-<time>`. Never overwrites an earlier one.
/// Logs the path only, never the contents. Call with the file's lock held.
fn quarantine(path: &Path) -> Result<(), String> {
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ").to_string();
    let base = sibling(path, &format!(".corrupt-{stamp}"));
    let mut dest = base.clone();
    let mut n = 1;
    while dest.exists() {
        dest = sibling(&base, &format!("-{n}"));
        n += 1;
    }
    fs::rename(path, &dest).map_err(|e| {
        format!(
            "{} is corrupt and couldn't be moved aside: {e}",
            path.display()
        )
    })?;
    restrict_perms(&dest);
    eprintln!(
        "trace: {} was corrupt; moved it to {} and started from the default",
        path.display(),
        dest.display()
    );
    Ok(())
}

/// The file's value. `None` means start from the default: it doesn't exist, or it was
/// corrupt and has been moved aside. `Err` is any other failure, and the caller must
/// not write over the file on the strength of it.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    match parse(path)? {
        Parsed::Missing => return Ok(None),
        Parsed::Value(value) => return Ok(Some(value)),
        Parsed::Corrupt => {}
    }
    // Decide under the lock, or a writer could replace the file with a good one
    // between this read and the move, and that good file would be the one moved.
    let _lock = if lock::held_by_this_thread(path) {
        None
    } else {
        Some(FileLock::acquire(path)?)
    };
    std::thread::sleep(SETTLE);
    match parse(path)? {
        Parsed::Missing => Ok(None),
        Parsed::Value(value) => Ok(Some(value)),
        Parsed::Corrupt => quarantine(path).map(|()| None),
    }
}

/// [`read_json`], with `None` as `T::default()`.
pub fn read_or_default<T: DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    Ok(read_json(path)?.unwrap_or_default())
}

/// [`read_or_default`] for read-only callers with no way to return an error: logs it
/// and gives the default. Safe because the value can't reach the disk: every write
/// derived from a file's contents goes through [`update`], which reads for itself.
pub fn read_or_log<T: DeserializeOwned + Default>(path: &Path) -> T {
    read_or_default(path).unwrap_or_else(|e| {
        eprintln!("trace: {e}");
        T::default()
    })
}

// ---- serialized updates ----------------------------------------------------

/// Load, mutate and save `path` under its lock, so no other thread or trace can slip
/// in between. On a read error `f` never runs and the file is untouched. If `f` leaves
/// the value as it was, nothing is written.
///
/// The lock is held while `f` runs, so `f` must be quick: do git and network work
/// before or after. It must not call `update` on any file; that returns an error.
pub fn update<T, R>(path: &Path, style: Style, f: impl FnOnce(&mut T) -> R) -> Result<R, String>
where
    T: Serialize + DeserializeOwned + Default,
{
    update_or(path, style, T::default, f)
}

/// [`update`], starting from `init()` rather than `T::default()` when there's no file.
pub fn update_or<T, R>(
    path: &Path,
    style: Style,
    init: impl FnOnce() -> T,
    f: impl FnOnce(&mut T) -> R,
) -> Result<R, String>
where
    T: Serialize + DeserializeOwned,
{
    let _lock = FileLock::acquire(path)?;
    let mut value = read_json(path)?.unwrap_or_else(init);
    let before = to_bytes(&value, style)?;
    let result = f(&mut value);
    let after = to_bytes(&value, style)?;
    if after == before {
        restrict_perms(path);
    } else {
        write_atomic(path, &after)?;
    }
    Ok(result)
}

#[cfg(all(test, unix))]
mod tests;
