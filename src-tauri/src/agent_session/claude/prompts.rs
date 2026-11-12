//! Claude's permission prompts. With `--permission-prompt-tool stdio`, each tool
//! use that needs a decision arrives as a `control_request` (`can_use_tool`):
//! this turns one into an approval row (or a question row for AskUserQuestion)
//! and the user's answer into the `control_response` Claude waits for.

use serde_json::{json, Map, Value};

use crate::agent_session::journal::{
    cap, Answer, Approval, ApprovalKind, ApprovalOption, Question, QuestionOption, QuestionSet,
};

/// What answering a prompt needs: the request as Claude sent it.
pub struct Pending {
    pub row_id: String,
    /// The tool the prompt is about, for the rule an "always" answer writes.
    pub tool: String,
    input: Value,
    /// `permission_suggestions`, offered one "always" option each.
    suggestions: Vec<Value>,
    /// AskUserQuestion's question texts, by `Question::id` order: Claude keys
    /// the answers by text.
    questions: Vec<String>,
}

/// An approval row for a `can_use_tool` request.
pub fn approval(request_id: &str, req: &Value) -> (Approval, Pending) {
    let tool = str_at(req, "tool_name").unwrap_or("tool").to_string();
    let display = str_at(req, "display_name").unwrap_or(&tool).to_string();
    let input = req.get("input").cloned().unwrap_or(Value::Null);
    let suggestions = req
        .get("permission_suggestions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut options = vec![option(
        "allow",
        "Allow once".into(),
        ApprovalKind::AllowOnce,
    )];
    for (i, s) in suggestions.iter().enumerate() {
        options.push(option(
            &format!("always:{i}"),
            always_label(s),
            ApprovalKind::AllowAlways,
        ));
    }
    options.push(option("deny", "Deny".into(), ApprovalKind::Deny));
    let approval = Approval {
        request_id: request_id.to_string(),
        call_id: str_at(req, "tool_use_id").map(str::to_string),
        title: title(&tool, &display, &input),
        detail: detail(&tool, &input, str_at(req, "description")),
        tool,
        options,
        resolution: None,
    };
    let pending = Pending {
        row_id: format!("approval:{request_id}"),
        tool: approval.tool.clone(),
        input,
        suggestions,
        questions: Vec::new(),
    };
    (approval, pending)
}

/// A question row for an AskUserQuestion `can_use_tool` request.
pub fn questions(request_id: &str, req: &Value) -> (QuestionSet, Pending) {
    let input = req.get("input").cloned().unwrap_or(Value::Null);
    let asked = input
        .get("questions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let questions: Vec<Question> = asked
        .iter()
        .enumerate()
        .map(|(i, q)| Question {
            id: format!("q{i}"),
            header: str_at(q, "header").map(str::to_string),
            text: str_at(q, "question").unwrap_or_default().to_string(),
            options: q
                .get("options")
                .and_then(Value::as_array)
                .map(|opts| {
                    opts.iter()
                        .map(|o| QuestionOption {
                            label: str_at(o, "label").unwrap_or_default().to_string(),
                            description: str_at(o, "description").map(str::to_string),
                            preview: str_at(o, "preview")
                                .filter(|p| !p.trim().is_empty())
                                .map(str::to_string),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            multi_select: q
                .get("multiSelect")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            allow_free_text: true,
        })
        .collect();
    let pending = Pending {
        row_id: format!("question:{request_id}"),
        tool: "AskUserQuestion".to_string(),
        input,
        suggestions: Vec::new(),
        questions: questions.iter().map(|q| q.text.clone()).collect(),
    };
    let set = QuestionSet {
        request_id: request_id.to_string(),
        questions,
        resolution: None,
    };
    (set, pending)
}

/// The `control_response` that lets a call through as the agent wrote it.
pub fn allow(request_id: &str, input: &Value) -> Value {
    control_response(
        request_id,
        json!({"behavior": "allow", "updatedInput": input}),
    )
}

/// The `control_response` that refuses a call, with the reason the agent is told.
pub fn deny(request_id: &str, message: &str) -> Value {
    control_response(request_id, json!({"behavior": "deny", "message": message}))
}

/// One decision, wrapped as the frame Claude is waiting for.
fn control_response(request_id: &str, decision: Value) -> Value {
    json!({
        "type": "control_response",
        "response": {"subtype": "success", "request_id": request_id, "response": decision},
    })
}

impl Pending {
    /// The rule an "always" option stands for, written as trace stores it: Claude's
    /// own suggestion where it made one (`Bash(git status:*)`), so the rule kept is
    /// the one the button named. A suggestion trace can't express as a rule (a
    /// folder, a mode change) falls back to this exact call, which is narrower than
    /// the button promises but never wider.
    pub fn rule_for(&self, option_id: &str) -> String {
        let suggested = option_id
            .strip_prefix("always:")
            .and_then(|i| i.parse::<usize>().ok())
            .and_then(|i| self.suggestions.get(i))
            .and_then(suggested_rule);
        suggested.unwrap_or_else(|| {
            match crate::permissions::tools::subject(&self.tool, &self.input) {
                Some(subject) => format!("{}({subject})", self.tool),
                None => self.tool.clone(),
            }
        })
    }
}

/// An `addRules` suggestion as a rule string; `None` for the kinds that aren't one.
fn suggested_rule(s: &Value) -> Option<String> {
    if str_at(s, "type") != Some("addRules") {
        return None;
    }
    let rule = s.get("rules").and_then(Value::as_array)?.first()?;
    let tool = str_at(rule, "toolName")?;
    Some(match str_at(rule, "ruleContent") {
        Some(content) => format!("{tool}({content})"),
        None => tool.to_string(),
    })
}

/// The `control_response` that gives Claude the user's `answer`. In trace's own
/// mode the "always" options become trace's rules (`permissions::grant`), so
/// nothing is written into Claude's: its own allow rules are outranked anyway by
/// the ask rule that brought the call here.
pub fn response(
    request_id: &str,
    pending: &Pending,
    answer: &Answer,
    trace_mode: bool,
) -> Result<Value, String> {
    let decision = match answer {
        Answer::Approval { option_id, note } => match option_id.as_str() {
            "allow" => json!({"behavior": "allow", "updatedInput": pending.input}),
            "deny" => json!({
                "behavior": "deny",
                "message": note.clone().filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| "The user denied this.".to_string()),
            }),
            other => {
                let rule = other
                    .strip_prefix("always:")
                    .and_then(|i| i.parse::<usize>().ok())
                    .and_then(|i| pending.suggestions.get(i))
                    .ok_or_else(|| format!("Unknown option {other}."))?;
                if trace_mode {
                    json!({"behavior": "allow", "updatedInput": pending.input})
                } else {
                    json!({
                        "behavior": "allow",
                        "updatedInput": pending.input,
                        "updatedPermissions": [rule],
                    })
                }
            }
        },
        // AskUserQuestion reads the answers from its input, keyed by question
        // text; several choices are joined with ", " as Claude Code's own dialog does.
        Answer::Questions { answers } => {
            let mut by_text = Map::new();
            for (i, text) in pending.questions.iter().enumerate() {
                if let Some(chosen) = answers.get(&format!("q{i}")).filter(|c| !c.is_empty()) {
                    by_text.insert(text.clone(), Value::String(chosen.join(", ")));
                }
            }
            let mut input = pending.input.clone();
            if let Some(obj) = input.as_object_mut() {
                obj.insert("answers".to_string(), Value::Object(by_text));
            }
            json!({"behavior": "allow", "updatedInput": input})
        }
    };
    Ok(control_response(request_id, decision))
}

fn option(id: &str, label: String, kind: ApprovalKind) -> ApprovalOption {
    ApprovalOption {
        id: id.to_string(),
        label,
        kind,
    }
}

/// A label for one of Claude's permission suggestions.
fn always_label(s: &Value) -> String {
    match str_at(s, "type") {
        Some("addRules") => {
            let rule = s
                .get("rules")
                .and_then(Value::as_array)
                .and_then(|r| r.first());
            let tool = rule
                .and_then(|r| str_at(r, "toolName"))
                .unwrap_or("this tool");
            match rule.and_then(|r| str_at(r, "ruleContent")) {
                Some(content) => format!("Always allow {tool}({content})"),
                None => format!("Always allow {tool}"),
            }
        }
        Some("addDirectories") => "Always allow in this folder".to_string(),
        Some("setMode") if str_at(s, "mode") == Some("acceptEdits") => {
            "Allow all edits this session".to_string()
        }
        Some("setMode") => format!("Switch to {} mode", str_at(s, "mode").unwrap_or("another")),
        _ => "Always allow".to_string(),
    }
}

/// One line saying what the tool will do.
fn title(tool: &str, display: &str, input: &Value) -> String {
    let path = str_at(input, "file_path").or_else(|| str_at(input, "notebook_path"));
    let line = match (tool, path) {
        ("Bash" | "PowerShell", _) => str_at(input, "command").map(|c| format!("Run {c}")),
        ("Write", Some(p)) => Some(format!("Write {p}")),
        ("Edit" | "MultiEdit" | "NotebookEdit", Some(p)) => Some(format!("Edit {p}")),
        ("WebFetch", _) => str_at(input, "url").map(|u| format!("Fetch {u}")),
        _ => None,
    }
    .unwrap_or_else(|| format!("Use {display}"));
    let first = line.lines().next().unwrap_or_default();
    if first.chars().count() > 120 {
        format!("{}…", first.chars().take(119).collect::<String>())
    } else {
        first.to_string()
    }
}

/// The full command for a shell tool, else Claude's description or the input.
fn detail(tool: &str, input: &Value, description: Option<&str>) -> Option<String> {
    if matches!(tool, "Bash" | "PowerShell") {
        return str_at(input, "command").map(cap);
    }
    match description {
        Some(d) if !d.is_empty() && !matches!(tool, "Edit" | "MultiEdit" | "Write") => Some(cap(d)),
        _ => serde_json::to_string_pretty(input).ok().map(|s| cap(&s)),
    }
}

/// `v[key]` as a string, if it is one: stream-json is read field by field
/// rather than into types, so a newer CLI's extra or missing fields don't break it.
pub fn str_at<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
