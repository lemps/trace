//! Importing the custom prompts the user ticked, as new saved prompts.
//!
//! The choices are only keys and edited names: each text is taken from the
//! fresh preview, and every prompt goes through `saved_prompts`, which only adds
//! (a taken name is refused there, under its lock), so nothing existing changes.

use super::model::{PromptChoice, PromptPreview, Report};
use super::prompts::kind;
use crate::saved_prompts::{PromptDraft, SavedPrompt};

/// Add the `chosen` ones of `prompts` with `add_all` (`saved_prompts::add_all`, or
/// a temp file's in tests), and report on every prompt.
pub fn apply(
    prompts: &[PromptPreview],
    chosen: &[PromptChoice],
    add_all: impl FnOnce(&[PromptDraft]) -> Result<Vec<Result<SavedPrompt, String>>, String>,
    report: &mut Report,
) {
    let mut picked: Vec<(&PromptPreview, PromptDraft)> = Vec::new();
    let mut unticked = 0;
    for p in prompts {
        if let Some(existing) = &p.existing {
            report.skip(
                &p.title,
                format!("trace already has this text, as /{existing}."),
            );
            continue;
        }
        let Some(choice) = chosen.iter().find(|c| c.key == p.key) else {
            unticked += 1;
            continue;
        };
        let name = choice
            .name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .unwrap_or(&p.name);
        let draft = PromptDraft {
            id: None,
            name: name.to_string(),
            title: p.title.clone(),
            body: p.body.clone(),
        };
        picked.push((p, draft));
    }
    if unticked > 0 {
        report.skip(
            format!("{unticked} Conductor prompts"),
            "Left unticked in the preview.",
        );
    }
    if picked.is_empty() {
        return;
    }
    let drafts: Vec<PromptDraft> = picked.iter().map(|(_, d)| d.clone()).collect();
    match add_all(&drafts) {
        Ok(results) => {
            for ((p, draft), result) in picked.iter().zip(results) {
                match result {
                    Ok(saved) => report.ok(
                        format!("/{}", saved.name),
                        format!("Saved prompt, from {}.", origin(p)),
                    ),
                    Err(e) => report.skip(format!("/{}", draft.name), e),
                }
            }
        }
        Err(e) => {
            for (_, draft) in &picked {
                report.skip(format!("/{}", draft.name), e.clone());
            }
        }
    }
}

/// "Conductor's create PR prompt for app, web".
fn origin(p: &PromptPreview) -> String {
    let label = kind(&p.kind).map_or("custom", |k| k.label);
    format!("Conductor's {label} prompt for {}", p.repos.join(", "))
}
