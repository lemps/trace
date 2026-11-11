//! The tool vocabulary a rule is written against: which tools only read, and the one
//! line of a call that a rule's specifier matches.
//!
//! The names mirror `src/domains/agentChat/toolSummary.ts`, which is where the
//! renderer's own categories live; `tests.rs` pins the two together so they can't
//! drift apart silently.

use serde_json::Value;

/// trace's own tools, served over its loopback MCP endpoint. They are trace's policy
/// already (the renderer runs them, and the two that touch a repo wait on a confirm
/// card of their own), so they never go in front of a permission card.
pub const TRACE_PREFIX: &str = "mcp__trace";

/// Tools that only ever read. Allowed without a card so a turn that reads twenty
/// files doesn't ask twenty times — and without a round trip to the renderer.
/// Claude's own names first, then Codex's.
pub const READ_ONLY: &[&str] = &[
    "Read",
    "Grep",
    "Glob",
    "NotebookRead",
    "read_file",
    "grep_files",
    "list_dir",
    "view_image",
];

pub fn is_trace_tool(tool: &str) -> bool {
    tool.starts_with(TRACE_PREFIX)
}

pub fn is_read_only(tool: &str) -> bool {
    READ_ONLY.contains(&tool)
}

/// The field a rule's specifier is matched against, by tool: a command, a path, a
/// URL, a query. `None` when the tool has no one line worth matching, in which case
/// only a bare-name or glob rule can match it.
pub fn subject(tool: &str, input: &Value) -> Option<String> {
    let at = |key: &str| input.get(key).and_then(Value::as_str).map(str::to_string);
    match tool {
        // Claude
        "Bash" | "PowerShell" => at("command"),
        "Edit" | "MultiEdit" | "Write" | "Read" => at("file_path"),
        "NotebookEdit" | "NotebookRead" => at("notebook_path"),
        "WebFetch" => at("url"),
        "WebSearch" => at("query"),
        "Glob" | "Grep" => at("pattern").or_else(|| at("path")),
        "Task" | "Agent" => at("description"),
        // Codex
        "shell" | "local_shell" | "exec_command" | "unified_exec" => at("command"),
        "apply_patch" => at("path"),
        "read_file" => at("path"),
        "web_search" => at("query"),
        _ => None,
    }
}

/// A shell line split into the commands it actually runs, so a rule for `rm *` still
/// matches `cd /tmp && rm -rf x`. Deliberately simple — it splits on the operators
/// and strips the usual wrappers, and that is all. A rule is a convenience, **not** a
/// security boundary: the same program reached another way (a script, a different
/// name, a quoted operator) won't match, which is why a deny rule here is a
/// guardrail rather than a sandbox.
pub fn commands_in(line: &str) -> Vec<String> {
    line.split(|c| c == ';' || c == '\n')
        .flat_map(|part| part.split("&&"))
        .flat_map(|part| part.split("||"))
        .flat_map(|part| part.split('|'))
        .map(strip_wrappers)
        .filter(|part| !part.is_empty())
        .collect()
}

/// A command without its leading environment assignments or `sudo`/`time`-style
/// wrapper, so `FOO=bar rm -rf x` matches a rule for `rm *`.
fn strip_wrappers(part: &str) -> String {
    let mut rest = part.trim();
    loop {
        let Some(word) = rest.split_whitespace().next() else {
            return String::new();
        };
        let is_assignment = word.contains('=')
            && word.split('=').next().is_some_and(|k| {
                !k.is_empty() && k.chars().all(|c| c.is_alphanumeric() || c == '_')
            });
        if !is_assignment && !matches!(word, "sudo" | "command" | "time" | "nohup" | "env") {
            return rest.to_string();
        }
        rest = rest[word.len()..].trim_start();
    }
}
