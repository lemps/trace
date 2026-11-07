//! Persistence for scheduled prompts and runs: two `0600` JSON files in the
//! config dir. The runner thread, commands and a second trace all write, so every
//! load→mutate→save goes through `update_*`, serialized by `persist`'s per-file lock.
//! The two locks are never held at the same time.

use std::path::PathBuf;

use super::model::{RunStatus, ScheduleRun, ScheduledPrompt};
use crate::helpers::persist::{self, Style};
use crate::helpers::trace_dir;

/// Runs kept per prompt. Older ones — and their transcripts — are pruned.
const RUNS_PER_PROMPT: usize = 30;

/// Skipped runs (the precheck said no) kept per prompt, on top of the real ones.
const SKIPPED_PER_PROMPT: usize = 10;

fn prompts_file() -> PathBuf {
    trace_dir().join("schedules.json")
}

fn runs_file() -> PathBuf {
    trace_dir().join("schedule-runs.json")
}

/// Every scheduled prompt, in creation order. A read failure is logged and reads as
/// none; anything that would act on "there are none" uses [`try_prompts`].
pub fn prompts() -> Vec<ScheduledPrompt> {
    persist::read_or_log(&prompts_file())
}

/// [`prompts`], with a read failure as an error.
pub fn try_prompts() -> Result<Vec<ScheduledPrompt>, String> {
    persist::read_or_default(&prompts_file())
}

pub fn prompt(id: &str) -> Option<ScheduledPrompt> {
    prompts().into_iter().find(|p| p.id == id)
}

/// Load, mutate and save the prompt list atomically (w.r.t. other writers).
pub fn update_prompts<R>(f: impl FnOnce(&mut Vec<ScheduledPrompt>) -> R) -> Result<R, String> {
    persist::update(&prompts_file(), Style::Compact, f)
}

/// Every run record, oldest first. A read failure is logged and reads as none.
pub fn runs() -> Vec<ScheduleRun> {
    persist::read_or_log(&runs_file())
}

/// [`runs`], with a read failure as an error.
pub fn try_runs() -> Result<Vec<ScheduleRun>, String> {
    persist::read_or_default(&runs_file())
}

/// Load, mutate and save the run list atomically (w.r.t. other writers).
pub fn update_runs<R>(f: impl FnOnce(&mut Vec<ScheduleRun>) -> R) -> Result<R, String> {
    persist::update(&runs_file(), Style::Compact, f)
}

/// Mutate one run; returns its updated copy (`None` if it no longer exists).
pub fn update_run(
    run_id: &str,
    f: impl FnOnce(&mut ScheduleRun),
) -> Result<Option<ScheduleRun>, String> {
    update_runs(|runs| {
        runs.iter_mut().find(|r| r.id == run_id).map(|r| {
            f(r);
            r.clone()
        })
    })
}

/// When `prompt_id` last really ran (a skipped run doesn't count), leaving out
/// `except` (the run asking). Feeds `{lastRunAt}` and the precheck's
/// `TRACE_LAST_RUN_AT`.
pub fn last_run_at(prompt_id: &str, except: &str) -> Option<i64> {
    runs()
        .into_iter()
        .filter(|r| r.prompt_id == prompt_id && r.id != except)
        .filter(|r| r.status != RunStatus::Skipped)
        .map(|r| r.started_at)
        .max()
}

/// Record a new run, pruning its prompt's oldest finished runs past the cap.
/// Skipped runs have a cap of their own, so a precheck that skips every few
/// minutes can't push the real runs out of the history.
pub fn push_run(run: ScheduleRun) -> Result<(), String> {
    let prompt_id = run.prompt_id.clone();
    let pruned = update_runs(|runs| {
        runs.push(run);
        let doomed = prunable(runs, &prompt_id);
        runs.retain(|r| !doomed.contains(&r.id));
        doomed
    })?;
    for id in pruned {
        super::transcript::delete(&id);
    }
    Ok(())
}

/// Ids of `prompt_id`'s runs past the caps, oldest first (`runs` is oldest-first).
fn prunable(runs: &[ScheduleRun], prompt_id: &str) -> Vec<String> {
    let mine: Vec<&ScheduleRun> = runs.iter().filter(|r| r.prompt_id == prompt_id).collect();
    let (skipped, kept): (Vec<&ScheduleRun>, Vec<&ScheduleRun>) = mine
        .into_iter()
        .partition(|r| r.status == RunStatus::Skipped);
    let mut doomed = oldest_finished(&kept, RUNS_PER_PROMPT);
    doomed.extend(oldest_finished(&skipped, SKIPPED_PER_PROMPT));
    doomed
}

/// The oldest finished runs that take `runs` past `cap`.
fn oldest_finished(runs: &[&ScheduleRun], cap: usize) -> Vec<String> {
    let excess = runs.len().saturating_sub(cap);
    runs.iter()
        .filter(|r| r.status != RunStatus::Running)
        .take(excess)
        .map(|r| r.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schedule::model::Trigger;

    fn run(id: usize, status: RunStatus) -> ScheduleRun {
        ScheduleRun {
            id: id.to_string(),
            prompt_id: "p".to_string(),
            trigger: Trigger::Schedule,
            status,
            started_at: id as i64,
            ended_at: None,
            prompt: String::new(),
            claude_session_id: None,
            needs_input: false,
            skipped: 0,
            background_tasks: 0,
            wakes_at: None,
            summary: String::new(),
            error: None,
            has_transcript: false,
            precheck: None,
        }
    }

    #[test]
    fn skipped_runs_are_capped_apart_from_real_ones() {
        let mut runs: Vec<ScheduleRun> = (0..RUNS_PER_PROMPT)
            .map(|i| run(i, RunStatus::Succeeded))
            .collect();
        let base = runs.len();
        runs.extend((0..SKIPPED_PER_PROMPT + 3).map(|i| run(base + i, RunStatus::Skipped)));
        let doomed = prunable(&runs, "p");
        // No real run goes; the three oldest skips do.
        let expected: Vec<String> = (base..base + 3).map(|i| i.to_string()).collect();
        assert_eq!(doomed, expected);

        runs.push(run(999, RunStatus::Failed));
        assert!(prunable(&runs, "p").contains(&"0".to_string()));
    }

    #[test]
    fn a_running_run_is_never_pruned() {
        let mut runs = vec![run(0, RunStatus::Running)];
        runs.extend((1..=RUNS_PER_PROMPT).map(|i| run(i, RunStatus::Succeeded)));
        assert_eq!(prunable(&runs, "p"), vec!["1".to_string()]);
    }
}
