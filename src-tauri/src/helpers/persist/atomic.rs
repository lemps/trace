//! Atomic file replacement: a temp file in the same directory is created user-only,
//! synced, then renamed over the target.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use super::{owner_only, sibling};

/// A temp file that deletes itself unless it was renamed into place.
pub(super) struct TempFile {
    pub(super) path: PathBuf,
    file: File,
    renamed: bool,
}

impl TempFile {
    /// `create_new` refuses to reuse a name, and the uuid keeps writers apart.
    pub(super) fn create(target: &Path) -> io::Result<Self> {
        let path = sibling(target, &format!(".{}.tmp", crate::helpers::new_id()));
        let file = owner_only().write(true).create_new(true).open(&path)?;
        Ok(Self {
            path,
            file,
            renamed: false,
        })
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        if !self.renamed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn replace(path: &Path, bytes: &[u8]) -> io::Result<()> {
    // Write through a symlink like `fs::write` did, rather than replacing the link.
    let target = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let dir = target.parent().map(Path::to_path_buf);
    if let Some(dir) = &dir {
        fs::create_dir_all(dir)?;
    }
    let mut tmp = TempFile::create(&target)?;
    tmp.file.write_all(bytes)?;
    tmp.file.sync_all()?;
    fs::rename(&tmp.path, &target)?;
    tmp.renamed = true;
    // Makes the rename itself durable. Best effort: atomicity doesn't depend on it.
    if let Some(Ok(dir)) = dir.map(File::open) {
        let _ = dir.sync_all();
    }
    Ok(())
}

/// Atomically replace `path` with `bytes`, user-only. Creates the parent directories.
/// For whole values that don't depend on what's there, like a credential the user just
/// entered; anything derived from the current contents goes through `update`.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    replace(path, bytes).map_err(|e| format!("Couldn't write {}: {e}", path.display()))
}
