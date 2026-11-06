//! Test runner — runs the issue worktree's test command and reports the result
//! onto the design's `.test-suite` / `.tests-summary` view. Detection is
//! best-effort across common toolchains; the suite-level pass/fail is the
//! process exit code (per-test parsing is framework-specific and out of scope).

use std::collections::HashMap;
use std::path::Path;
use std::time::Instant;

use serde::Serialize;

use crate::platform::ports::ToolLocator;
use crate::platform::Os;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRun {
    /// Human-readable command we ran, e.g. "cargo test".
    pub command: String,
    pub passed: bool,
    pub exit_code: i32,
    pub duration_ms: u64,
    /// Combined stdout+stderr, tail-truncated for the detail view.
    pub output: String,
}

/// Stands in for the project's own Gradle wrapper, whose file name differs per OS.
const GRADLE_WRAPPER: &str = "./gradlew";

/// Pick a test command for the worktree based on the toolchain files present.
/// Returns `(program, args, display)`.
fn detect(dir: &str) -> Option<(&'static str, Vec<&'static str>, &'static str)> {
    let has = |f: &str| Path::new(&format!("{dir}/{f}")).exists();
    if has("gradlew") {
        return Some((
            GRADLE_WRAPPER,
            vec!["test", "--console=plain"],
            "./gradlew test",
        ));
    }
    if has("Cargo.toml") {
        return Some(("cargo", vec!["test"], "cargo test"));
    }
    if has("pom.xml") {
        return Some(("mvn", vec!["test", "-q"], "mvn test"));
    }
    if has("go.mod") {
        return Some(("go", vec!["test", "./..."], "go test ./..."));
    }
    if has("package.json") {
        // Only if a real test script is defined (skip the npm-init default).
        if let Ok(pkg) = std::fs::read_to_string(format!("{dir}/package.json")) {
            if pkg.contains("\"test\"") && !pkg.contains("no test specified") {
                return Some(("npm", vec!["test", "--silent"], "npm test"));
            }
        }
    }
    if has("pyproject.toml") || has("pytest.ini") || has("setup.py") {
        return Some(("pytest", vec!["-q"], "pytest -q"));
    }
    None
}

/// Tail-truncate combined output so the payload stays small for the UI.
fn tail(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    // Test output is full of multibyte characters (✓, box drawing), and slicing
    // inside one panics. Move forward to the next boundary.
    let mut start = s.len() - max;
    while !s.is_char_boundary(start) {
        start += 1;
    }
    format!("…\n{}", &s[start..])
}

/// Run the worktree's tests and return a single suite-level result.
///
/// `async` + `spawn_blocking` is essential: a synchronous command runs on the
/// main thread, so a multi-minute `gradle`/`cargo test` would freeze the whole
/// UI. We resolve the issue's repo up front, then run the process on a blocking
/// thread.
#[tauri::command]
pub async fn run_tests(issue_key: String) -> Result<TestRun, String> {
    let repo = crate::commands::repos::repo_for(&issue_key)?;
    tauri::async_runtime::spawn_blocking(move || run_blocking(&repo, &issue_key))
        .await
        .map_err(|e| format!("Test runner failed to start: {e}"))?
}

/// The blocking work — detect the toolchain and run its test command.
fn run_blocking(repo: &str, issue_key: &str) -> Result<TestRun, String> {
    let worktree = crate::commands::repos::workspace_dir(repo, issue_key);
    if !Path::new(&worktree).exists() {
        return Err(format!(
            "No worktree for {issue_key} — start a session on this issue first."
        ));
    }

    let (program, args, display) = detect(&worktree).ok_or_else(|| {
        "No test command detected (looked for gradlew, Cargo.toml, pom.xml, go.mod, \
         package.json, pytest)."
            .to_string()
    })?;

    // An app opened from Finder has a minimal PATH with no npm, cargo or mvn.
    // Setting the user's PATH here makes `Command` search it for `program` too,
    // and lets the tool find what it calls in turn (npm needs node).
    let env = crate::claude::env::build_effective_cli_env(&HashMap::new());
    let started = Instant::now();
    // A project's own wrapper is a path; anything else is a tool to look up.
    let resolved = if program == GRADLE_WRAPPER {
        Os::project_wrapper(Path::new(&worktree), "gradlew")
            .to_string_lossy()
            .into_owned()
    } else {
        crate::claude::discovery::find_cli_with_env(program, Some(&env))
            .unwrap_or_else(|| program.to_string())
    };
    let out = crate::platform::process::command(resolved)
        .args(&args)
        .envs(&env)
        .current_dir(&worktree)
        .output()
        .map_err(|e| format!("Failed to run {display}: {e}"))?;
    let duration_ms = started.elapsed().as_millis() as u64;

    let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&out.stderr));

    Ok(TestRun {
        command: display.to_string(),
        passed: out.status.success(),
        exit_code: out.status.code().unwrap_or(-1),
        duration_ms,
        output: tail(combined.trim(), 16_000),
    })
}

#[cfg(test)]
mod tail_tests {
    use super::tail;

    #[test]
    fn tail_keeps_short_output_whole() {
        assert_eq!(tail("ok", 10), "ok");
    }

    #[test]
    fn tail_never_cuts_inside_a_multibyte_character() {
        // "✓" is 3 bytes, so a 4-byte tail starts inside the first of these two.
        assert_eq!(tail("✓✓", 4), "…\n✓");
    }
}
