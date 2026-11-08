//! HTML cards an older trace saved for its HTML tab (`rich-output.json`, workspace
//! id → cards). They show as HTML documents: each workspace's cards are imported
//! into its plan file the first time it's read. The old file is never rewritten
//! except to drop a deleted workspace, so an older trace still running beside
//! this one keeps its cards, and a card it adds later is imported then.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::model::{html_title, published_series, NewDoc, PlanFormat, PlanSource};
use super::store;
use crate::helpers::persist::{self, Style};

#[derive(Serialize, Deserialize)]
struct Card {
    id: u64,
    html: String,
}

fn cards_file() -> PathBuf {
    crate::helpers::trace_dir().join("rich-output.json")
}

/// The capture key that marks a card as imported.
fn reference(workspace_id: &str, id: u64) -> String {
    format!("rich:{workspace_id}:{id}")
}

/// The documents `cards` become, oldest first. Cards with one `<title>` are
/// versions of one document, as later ones are; untitled ones stand alone.
fn as_docs(workspace_id: &str, cards: Vec<Card>) -> Vec<NewDoc> {
    cards
        .into_iter()
        .map(|c| {
            let title = html_title(&c.html, "");
            let series = if title.is_empty() {
                format!("html:card-{}", c.id)
            } else {
                published_series(PlanFormat::Html, &title)
            };
            NewDoc {
                series,
                title: if title.is_empty() {
                    format!("HTML {}", c.id + 1)
                } else {
                    title
                },
                source: PlanSource::Published,
                format: PlanFormat::Html,
                body: c.html,
                reference: Some(reference(workspace_id, c.id)),
            }
        })
        .collect()
}

/// Bring `workspace_id`'s old cards into its plan file. Best-effort: a card that
/// can't be read stays in the old file for the next try.
pub fn import(workspace_id: &str) {
    // Once per workspace per run: the old file only changes if an older trace
    // runs alongside, and its new cards are picked up on the next start.
    {
        static DONE: std::sync::Mutex<Option<std::collections::HashSet<String>>> =
            std::sync::Mutex::new(None);
        let mut done = DONE.lock().unwrap_or_else(|e| e.into_inner());
        if !done
            .get_or_insert_with(Default::default)
            .insert(workspace_id.to_string())
        {
            return;
        }
    }
    let path = cards_file();
    if !path.exists() {
        return;
    }
    let Ok(mut all) = persist::read_or_default::<HashMap<String, Vec<Card>>>(&path) else {
        return;
    };
    let Some(cards) = all.remove(workspace_id).filter(|c| !c.is_empty()) else {
        return;
    };
    // Spaced a millisecond apart, before now, so they list in the order they came.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64);
    let docs = as_docs(workspace_id, cards);
    let n = docs.len() as u64;
    let result = store::update(workspace_id, |file| {
        for (i, doc) in docs.into_iter().enumerate() {
            store::add(file, doc, now.saturating_sub(n - i as u64));
        }
    });
    if let Err(e) = result {
        eprintln!("trace: {e}");
    }
}

/// The workspace is gone: drop its old cards too.
pub fn forget(workspace_id: &str) {
    let path = cards_file();
    if !path.exists() {
        return;
    }
    let _ = persist::update(
        &path,
        Style::Compact,
        |all: &mut HashMap<String, Vec<Card>>| {
            all.remove(workspace_id);
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plans::model::PlanFile;

    #[test]
    fn old_cards_become_html_documents_once() {
        let cards = vec![
            Card {
                id: 3,
                html: "<title>Arch</title><p>1</p>".into(),
            },
            Card {
                id: 4,
                html: "<p>untitled</p>".into(),
            },
            Card {
                id: 5,
                html: "<title>Arch</title><p>2</p>".into(),
            },
        ];
        let mut file = PlanFile::default();
        for d in as_docs("ws", cards) {
            store::add(&mut file, d, 1);
        }
        assert_eq!(file.docs.len(), 3);
        assert!(file.docs.iter().all(|d| d.format == PlanFormat::Html));
        let arch: Vec<_> = file.docs.iter().filter(|d| d.title == "Arch").collect();
        assert_eq!(
            arch.iter().map(|d| d.version).collect::<Vec<_>>(),
            vec![1, 2]
        );
        // Imported again (an older trace still lists them): nothing new.
        let again = vec![Card {
            id: 3,
            html: "<title>Arch</title><p>1</p>".into(),
        }];
        for d in as_docs("ws", again) {
            assert!(store::add(&mut file, d, 2).is_none());
        }
    }
}
