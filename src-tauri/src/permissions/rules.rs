//! Matching a rule against a call.
//!
//! A rule is written the way Claude Code writes its own: `Tool`, `Tool(specifier)`,
//! or a glob in the tool-name position (`mcp__*`, `*`). Keeping the syntax identical
//! is what lets the same list be enforced two ways — by trace for a chat agent, and
//! by Claude Code itself for a terminal one.

use serde_json::Value;

use super::model::Rule;
use super::tools;

/// A rule split into the tool it names and the specifier in its parentheses.
pub fn split(tool: &str) -> (&str, Option<&str>) {
    match tool.find('(') {
        Some(open) if tool.ends_with(')') => (&tool[..open], Some(&tool[open + 1..tool.len() - 1])),
        _ => (tool, None),
    }
}

/// Whether `pattern` matches `text`, with `*` standing for any run of characters.
/// Anchored at both ends, as Claude's own rules are.
pub fn glob(pattern: &str, text: &str) -> bool {
    let mut parts = pattern.split('*');
    let Some(first) = parts.next() else {
        return pattern == text;
    };
    if !text.starts_with(first) {
        return false;
    }
    // No `*` at all: it has to be the whole string.
    if !pattern.contains('*') {
        return pattern == text;
    }
    let mut rest = &text[first.len()..];
    let mut last: Option<&str> = None;
    for part in parts {
        last = Some(part);
        if part.is_empty() {
            continue;
        }
        let Some(at) = rest.find(part) else {
            return false;
        };
        rest = &rest[at + part.len()..];
    }
    // A pattern ending in a literal has to end the text too.
    match last {
        Some(tail) if !tail.is_empty() => text.ends_with(tail),
        _ => true,
    }
}

/// Whether `rule` applies to a call of `tool` with `input`, in `repo`.
pub fn matches(rule: &Rule, tool: &str, input: &Value, repo: Option<&str>) -> bool {
    if let Some(scoped) = rule.repo.as_deref() {
        if repo != Some(scoped) {
            return false;
        }
    }
    let (name, specifier) = split(&rule.tool);
    if !glob(name, tool) {
        return false;
    }
    let Some(specifier) = specifier else {
        return true;
    };
    let Some(subject) = tools::subject(tool, input) else {
        // A specifier that has nothing to match can't claim the call.
        return false;
    };
    if glob(specifier, &subject) {
        return true;
    }
    // A shell rule reaches the commands inside a compound line, as Claude's does.
    is_shell(tool)
        && tools::commands_in(&subject)
            .iter()
            .any(|part| glob(specifier, part))
}

fn is_shell(tool: &str) -> bool {
    matches!(
        tool,
        "Bash" | "PowerShell" | "shell" | "local_shell" | "exec_command" | "unified_exec"
    )
}
