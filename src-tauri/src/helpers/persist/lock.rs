//! The cross-process lock behind `update`: `flock` (std's `File::lock` family) on a
//! sidecar `<name>.lock`. A thread holds at most one, so two processes can't deadlock
//! on lock order, and a closure that calls `update` gets an error rather than blocking
//! on itself.

use std::cell::RefCell;
use std::fs::{self, File, TryLockError};
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{owner_only, sibling};

/// How long to wait for another writer before giving up with an error. Holders only
/// parse and write a small file, so this is only ever hit by a stuck process (a dev
/// build paused in a debugger), which mustn't freeze the UI forever.
const LOCK_WAIT: Duration = Duration::from_secs(10);
const LOCK_POLL_MAX: Duration = Duration::from_millis(20);

thread_local! {
    /// The file this thread holds the lock for. `flock` belongs to the open file, not
    /// the thread, so a nested attempt would block on itself: this catches that.
    static HELD: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
}

/// Whether this thread is inside an `update` of `path`.
pub(super) fn held_by_this_thread(path: &Path) -> bool {
    HELD.with(|held| held.borrow().as_deref() == Some(path))
}

/// Released when dropped (or if the process dies). The sidecar is never deleted:
/// removing it would let two processes each hold a "lock" on a different inode.
pub(super) struct FileLock {
    _file: File,
}

impl FileLock {
    pub(super) fn acquire(path: &Path) -> Result<Self, String> {
        Self::acquire_within(path, LOCK_WAIT)
    }

    pub(super) fn acquire_within(path: &Path, wait: Duration) -> Result<Self, String> {
        if let Some(held) = HELD.with(|held| held.borrow().clone()) {
            return Err(format!(
                "Can't lock {} while updating {}: updates can't nest.",
                path.display(),
                held.display()
            ));
        }
        let fail = |e: io::Error| format!("Couldn't lock {}: {e}", path.display());
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(fail)?;
        }
        let file = owner_only()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(sibling(path, ".lock"))
            .map_err(fail)?;
        let deadline = Instant::now() + wait;
        let mut pause = Duration::from_millis(1);
        loop {
            match file.try_lock() {
                Ok(()) => break,
                Err(TryLockError::Error(e)) => return Err(fail(e)),
                Err(TryLockError::WouldBlock) if Instant::now() >= deadline => {
                    return Err(format!(
                        "Timed out waiting for another trace to finish with {}.",
                        path.display()
                    ));
                }
                Err(TryLockError::WouldBlock) => {
                    std::thread::sleep(pause);
                    pause = (pause * 2).min(LOCK_POLL_MAX);
                }
            }
        }
        HELD.with(|held| *held.borrow_mut() = Some(path.to_path_buf()));
        Ok(Self { _file: file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        HELD.with(|held| *held.borrow_mut() = None);
    }
}
