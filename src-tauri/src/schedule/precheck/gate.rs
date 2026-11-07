//! Running a prompt's precheck as a step of its run: between the worktree being
//! ready and the agent starting. Records what it did on the run and, when the
//! run shouldn't go ahead, finishes it (skipped or failed).

use std::collections::HashMap;
use std::path::Path;

use tauri::{AppHandle, Manager};

use super::{run, PrecheckResult, Verdict, TIMEOUT};
use crate::schedule::model::{RunStatus, ScheduleRun, ScheduledPrompt};
use crate::schedule::{run as sched_run, run_workspace_id, store};
use crate::state::AppState;

/// Run `prompt`'s precheck for `run` in `cwd`. True when the run goes ahead;
/// false when it was skipped, failed, or stopped meanwhile (already finished).
pub fn passes(app: &AppHandle, prompt: &ScheduledPrompt, run_rec: &ScheduleRun, cwd: &str) -> bool {
    let Some(line) = prompt.precheck.as_deref() else {
        return true;
    };
    let ws = run_workspace_id(&run_rec.id);
    let state = app.state::<AppState>();
    // A stop (or the run's own timeout) removes the live entry.
    let stopped = || !state.live_runs.lock().contains_key(&ws);
    let env = crate::claude::env::build_effective_cli_env(&vars(prompt, run_rec));
    let (result, verdict) = match run(line, Path::new(cwd), &env, TIMEOUT, stopped) {
        Ok(result) => {
            let verdict = result.verdict();
            (result, verdict)
        }
        // Kept on the run all the same, so its history shows the line that failed.
        Err(err) => (unstarted(line), Verdict::Fail(err)),
    };
    let updated = store::update_run(&run_rec.id, |r| r.precheck = Some(result));
    // Announced even when the run was stopped meanwhile: `finish` told the
    // renderer before this result existed.
    if let Ok(Some(run)) = &updated {
        sched_run::emit(app, run);
    }
    match verdict {
        Verdict::Run if !stopped() => {
            if let Ok(Some(run)) = updated {
                // Deferred from `run::start`: a skip isn't worth a log line.
                crate::schedule::activity::log_run(app, &run);
            }
            true
        }
        Verdict::Run => false,
        Verdict::Skip => {
            sched_run::finish(app, &ws, RunStatus::Skipped, None);
            false
        }
        Verdict::Fail(err) => {
            sched_run::finish(app, &ws, RunStatus::Failed, Some(err));
            false
        }
    }
}

/// The record of a precheck that couldn't be started.
fn unstarted(line: &str) -> PrecheckResult {
    PrecheckResult {
        command: line.to_string(),
        exit_code: None,
        output: String::new(),
        timed_out: false,
        millis: 0,
    }
}

/// What the precheck can read about the run, on top of the agents' env.
fn vars(prompt: &ScheduledPrompt, run: &ScheduleRun) -> HashMap<String, String> {
    let last = store::last_run_at(&prompt.id, &run.id).map_or_else(String::new, |t| t.to_string());
    HashMap::from([
        ("TRACE_SCHEDULE_ID".to_string(), prompt.id.clone()),
        ("TRACE_SCHEDULE_TITLE".to_string(), prompt.title.clone()),
        ("TRACE_RUN_ID".to_string(), run.id.clone()),
        ("TRACE_LAST_RUN_AT".to_string(), last),
    ])
}
