//! Persist the agent rich-output (HTML cards) panel across restarts. Small JSON
//! in the config dir (no DB), keyed by workspace id, written 0600 like the rest
//! of our persistence. The frontend store is the source of truth; these commands
//! just load it on launch and save it on change.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, LoadGate, Style};
use crate::helpers::trace_dir;

/// One rendered card. Mirrors the frontend `HtmlBlock`; `html` is raw (the panel
/// renders it in a sandboxed iframe, so nothing here is trusted markup).
#[derive(Serialize, Deserialize)]
pub struct RichBlock {
    pub id: u64,
    pub html: String,
}

fn rich_output_file() -> PathBuf {
    trace_dir().join("rich-output.json")
}

/// The renderer treats a failed load as "no cards" and saves on the next change.
static RENDERER_COPY: LoadGate = LoadGate::new();

/// Load the saved cards (workspace id → cards). Missing/corrupt file → empty map,
/// so a first run or a hand-deleted file is never an error.
#[tauri::command]
pub fn load_rich_output() -> Result<HashMap<String, Vec<RichBlock>>, String> {
    RENDERER_COPY.observe(persist::read_or_default(&rich_output_file()))
}

/// Overwrite the saved cards with the store's current state.
#[tauri::command]
pub fn save_rich_output(blocks: HashMap<String, Vec<RichBlock>>) -> Result<(), String> {
    RENDERER_COPY.check()?;
    persist::update(
        &rich_output_file(),
        Style::Compact,
        |saved: &mut HashMap<String, Vec<RichBlock>>| *saved = blocks,
    )
}
