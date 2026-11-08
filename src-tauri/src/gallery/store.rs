//! Each workspace's Gallery sets on disk, `<config dir>/gallery/<workspace id>.json`
//! (user-only through `helpers::persist`): the folders or files an agent named, a
//! title and the scan options. Never pixels. Untrusted when read: each set is
//! checked on its own, so one bad entry is dropped rather than the file.
//!
//! The image protocol asks for a workspace's sets on every request, so they're also
//! kept in memory, keyed by the file's modified time.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::glob::Glob;
use super::kinds::MAX_INPUTS;
use crate::helpers::persist::{self, Style};

/// Sets kept per workspace; the oldest go first.
pub const MAX_SETS: usize = 30;
const MAX_TITLE: usize = 200;

/// A folder or a single image a set shows, canonical (symlinks resolved).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    pub path: PathBuf,
    pub folder: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GallerySet {
    pub id: String,
    pub title: String,
    pub roots: Vec<Root>,
    #[serde(default)]
    pub recursive: bool,
    #[serde(default)]
    pub glob: Option<String>,
    pub created_at: i64,
}

#[derive(Default, Serialize, Deserialize)]
struct RawFile {
    #[serde(default)]
    sets: Vec<Value>,
}

pub fn gallery_path(workspace_id: &str) -> PathBuf {
    crate::helpers::trace_dir().join("gallery").join(format!(
        "{}.json",
        crate::agent_session::store::file_stem(workspace_id)
    ))
}

type Cached = (Option<SystemTime>, Vec<GallerySet>);
static CACHE: Mutex<Option<HashMap<String, Cached>>> = Mutex::new(None);

fn modified(path: &std::path::Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// A workspace's validated sets, newest first.
pub fn load(workspace_id: &str) -> Result<Vec<GallerySet>, String> {
    let path = gallery_path(workspace_id);
    let stamp = modified(&path);
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let map = cache.get_or_insert_with(HashMap::new);
    if let Some((at, sets)) = map.get(workspace_id) {
        if *at == stamp && stamp.is_some() {
            return Ok(sets.clone());
        }
    }
    let raw: RawFile = persist::read_or_default(&path)?;
    let sets = validate(raw);
    map.insert(workspace_id.to_string(), (stamp, sets.clone()));
    Ok(sets)
}

/// Change a workspace's sets under the file's lock.
pub fn update<R>(
    workspace_id: &str,
    f: impl FnOnce(&mut Vec<GallerySet>) -> R,
) -> Result<R, String> {
    let path = gallery_path(workspace_id);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let out = persist::update(&path, Style::Compact, |raw: &mut RawFile| {
        let mut sets = validate(std::mem::take(raw));
        let out = f(&mut sets);
        trim(&mut sets);
        raw.sets = sets
            .iter()
            .filter_map(|s| serde_json::to_value(s).ok())
            .collect();
        out
    })?;
    if let Some(map) = CACHE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        map.remove(workspace_id);
    }
    Ok(out)
}

fn valid(set: &mut GallerySet) -> bool {
    if set.id.is_empty() || set.id.len() > 64 {
        return false;
    }
    if set.roots.is_empty() || set.roots.len() > MAX_INPUTS {
        return false;
    }
    if set.roots.iter().any(|r| !r.path.is_absolute()) {
        return false;
    }
    if let Some(g) = &set.glob {
        if Glob::new(g).is_err() {
            return false;
        }
    }
    set.title = set.title.chars().take(MAX_TITLE).collect();
    true
}

fn validate(raw: RawFile) -> Vec<GallerySet> {
    let mut sets: Vec<GallerySet> = Vec::new();
    for value in raw.sets {
        let Ok(mut set) = serde_json::from_value::<GallerySet>(value) else {
            continue;
        };
        if valid(&mut set) && !sets.iter().any(|s| s.id == set.id) {
            sets.push(set);
        }
    }
    trim(&mut sets);
    sets
}

fn trim(sets: &mut Vec<GallerySet>) {
    sets.sort_by_key(|s| std::cmp::Reverse(s.created_at));
    sets.truncate(MAX_SETS);
}

/// Drop `path` and `persist`'s lock file beside it.
fn remove_with_lock(path: PathBuf) {
    let _ = std::fs::remove_file(&path);
    let mut lock = path.into_os_string();
    lock.push(".lock");
    let _ = std::fs::remove_file(lock);
}

/// A deleted workspace's file goes with it.
pub fn forget(workspace_id: &str) {
    remove_with_lock(gallery_path(workspace_id));
}

/// A session's conversation now belongs to an issue: so does this file, unless the
/// issue already has one (which is kept).
pub fn transfer(from: &str, to: &str) {
    let (src, dst) = (gallery_path(from), gallery_path(to));
    if src.exists() && !dst.exists() {
        let _ = std::fs::rename(&src, &dst);
    }
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
