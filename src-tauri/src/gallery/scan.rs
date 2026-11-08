//! Turning what an agent named into a set's roots, and listing a set's images.
//! Paths are canonicalised up front (symlinks resolved, `..` gone), so a root is
//! where the files really are. Listing never follows a symlink out of its root and
//! skips anything that isn't an image or is over the size cap.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::contain;
use super::glob::Glob;
use super::kinds::{self, MAX_DEPTH, MAX_FILE_BYTES, MAX_IMAGES, MAX_INPUTS, MAX_VISITS};
use super::store::{GallerySet, Root};
use crate::platform::paths::plain;

/// One image in a set.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageEntry {
    /// Where it is, as the user reads it; also what the renderer asks for it by.
    pub path: String,
    pub name: String,
    /// Below its folder (`/`-separated), or the name for a single file.
    pub rel: String,
    pub size: u64,
    /// Unix ms, for the image URL to change when the file does.
    pub modified: i64,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub images: Vec<ImageEntry>,
    /// Images left out for being over the size cap.
    pub too_large: usize,
    /// The listing stopped at the image (or directory entry) cap.
    pub truncated: bool,
    /// Roots that are gone (moved or deleted since the set was made).
    pub missing: Vec<String>,
}

/// The roots for `inputs`, each absolute or relative to `cwd` (the agent's).
pub fn resolve(inputs: &[String], cwd: Option<&Path>) -> Result<Vec<Root>, String> {
    let inputs: Vec<&str> = inputs
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if inputs.is_empty() {
        return Err("Name a folder of images, or a list of image paths.".into());
    }
    if inputs.len() > MAX_INPUTS {
        return Err(format!(
            "Name at most {MAX_INPUTS} folders or files in one set."
        ));
    }
    let mut roots: Vec<Root> = Vec::new();
    for input in inputs {
        let given = PathBuf::from(input);
        let full = if given.is_absolute() {
            given
        } else {
            let cwd = cwd.ok_or_else(|| {
                format!("\"{input}\" is relative and trace doesn't know your working folder; give an absolute path.")
            })?;
            cwd.join(given)
        };
        let path = fs::canonicalize(&full)
            .map_err(|_| format!("There's no folder or file at {}.", full.display()))?;
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if meta.is_file() && kinds::mime_for(&path).is_none() {
            return Err(format!(
                "{} isn't an image the Gallery shows ({}).",
                plain(&path.to_string_lossy()),
                kinds::listed()
            ));
        }
        if !meta.is_file() && !meta.is_dir() {
            return Err(format!("{} isn't a folder or a file.", full.display()));
        }
        let root = Root {
            path,
            folder: meta.is_dir(),
        };
        if !roots.contains(&root) {
            roots.push(root);
        }
    }
    Ok(roots)
}

fn millis(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

struct Walk<'a> {
    set: &'a GallerySet,
    glob: Option<&'a Glob>,
    recursive: bool,
    out: Listing,
    seen: HashSet<String>,
    visits: usize,
}

impl Walk<'_> {
    fn full(&self) -> bool {
        self.out.images.len() >= MAX_IMAGES || self.visits >= MAX_VISITS
    }

    /// Add an image; `filter` applies the glob to `rel` (a file named outright, or a
    /// link `contain::admits` already checked, skips it).
    fn add(&mut self, path: &Path, rel: String, filter: bool) {
        if kinds::mime_for(path).is_none() {
            return;
        }
        if let (true, Some(g)) = (filter, self.glob) {
            if !g.matches(&rel) {
                return;
            }
        }
        let Ok(meta) = fs::metadata(path) else { return };
        if !meta.is_file() {
            return;
        }
        if meta.len() > MAX_FILE_BYTES {
            self.out.too_large += 1;
            return;
        }
        let shown = plain(&path.to_string_lossy());
        if self.seen.contains(&shown) {
            return;
        }
        if self.out.images.len() >= MAX_IMAGES {
            self.out.truncated = true;
            return;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        self.out.images.push(ImageEntry {
            path: shown.clone(),
            name,
            rel,
            size: meta.len(),
            modified: millis(&meta),
        });
        self.seen.insert(shown);
    }

    fn dir(&mut self, root: &Path, dir: &Path, depth: usize) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
        for entry in entries {
            self.visits += 1;
            if self.full() {
                self.out.truncated = true;
                return;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            let rel = rel_of(root, &path);
            if kind.is_symlink() {
                // Only a link to an image the set could show anyway counts (inside
                // this root, by its real name); directories behind links aren't walked.
                let Ok(target) = fs::canonicalize(&path) else {
                    continue;
                };
                if target.is_file() && contain::admits(self.set, &target) {
                    self.add(&target, rel, false);
                }
            } else if kind.is_dir() {
                if self.recursive && depth < MAX_DEPTH {
                    self.dir(root, &path, depth + 1);
                }
            } else if kind.is_file() {
                self.add(&path, rel, true);
            }
        }
    }
}

fn rel_of(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Every image `set` shows now.
pub fn list(set: &GallerySet) -> Listing {
    let mut walk = Walk {
        set,
        glob: set.glob.as_ref(),
        recursive: set.recursive,
        out: Listing::default(),
        seen: HashSet::new(),
        visits: 0,
    };
    for root in &set.roots {
        if !root.path.exists() {
            walk.out.missing.push(plain(&root.path.to_string_lossy()));
            continue;
        }
        if root.folder {
            walk.dir(&root.path, &root.path, 0);
        } else {
            let name = rel_of(root.path.parent().unwrap_or(&root.path), &root.path);
            // A file named outright isn't filtered by the glob.
            walk.add(&root.path, name, false);
        }
    }
    walk.out
}

#[cfg(test)]
#[path = "scan_tests.rs"]
pub(crate) mod tests;
