//! The journal: what every agent's conversation is normalised into, whatever its
//! brand or protocol. Mirrored by `src/domains/agentChat/types.ts`; keep the two in
//! step. See docs/AGENT_CHAT.md.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// One row of an agent's conversation. Rows are upserted by `id`: a later
/// `revision` replaces an earlier one (text streaming in, a tool finishing, a
/// prompt being answered).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JournalRow {
    /// Stable for the row's whole life, unique within the agent's journal.
    pub id: String,
    /// Grows each time the row changes.
    pub revision: u32,
    /// Order of first appearance in the journal.
    pub seq: u64,
    /// When the row first appeared, in Unix milliseconds.
    pub at: u64,
    /// The turn the row belongs to, if the adapter knows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub body: JournalBody,
}

/// What a row is. Tagged by `kind` on the wire.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum JournalBody {
    Message(Message),
    Tool(ToolCall),
    Diff(FileDiff),
    Plan(Plan),
    Approval(Approval),
    Question(QuestionSet),
    Status(Status),
    Turn(Turn),
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    User,
    Assistant,
    /// Thinking or reasoning text.
    Reasoning,
    System,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub role: Role,
    /// Markdown.
    pub text: String,
    /// True while text is still arriving.
    #[serde(default)]
    pub streaming: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolState {
    Running,
    Completed,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    /// The agent's own id for the call, which approvals and diffs refer back to.
    pub call_id: String,
    /// The agent's tool name ("Bash", "Edit", "shell", …); the UI maps known ones.
    pub name: String,
    pub input: Value,
    pub state: ToolState,
    /// The result, capped (see `cap`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    /// Set when a subagent (Task) made this call.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_call_id: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Add,
    Edit,
    Delete,
}

/// A file change. Adapters give `before`/`after` text, a unified `patch`, or both.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    pub path: String,
    /// Named `change`, not `kind`: `kind` is the body's own tag on the wire.
    pub change: ChangeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PlanStatus {
    Pending,
    InProgress,
    Done,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanItem {
    pub text: String,
    pub status: PlanStatus,
}

/// A task list (Claude's TodoWrite, Codex's plan updates).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub items: Vec<PlanItem>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ApprovalKind {
    AllowOnce,
    AllowAlways,
    Deny,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalOption {
    pub id: String,
    pub label: String,
    pub kind: ApprovalKind,
}

/// How a prompt ended. `answer` is what was chosen, in the form `Answer` takes.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Resolution {
    Answered {
        answer: Answer,
    },
    /// The agent withdrew it (the turn was interrupted, the agent stopped).
    Cancelled,
}

/// The agent asks to use a tool.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Approval {
    /// What `answer` is called with.
    pub request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub call_id: Option<String>,
    pub tool: String,
    /// One line: "Run npm test", "Edit src/app.ts".
    pub title: String,
    /// More context (the full command, a plan), capped.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub options: Vec<ApprovalOption>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<Resolution>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: String,
    /// A short label ("Auth method").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
    pub text: String,
    pub options: Vec<QuestionOption>,
    #[serde(default)]
    pub multi_select: bool,
    /// Whether a typed answer is accepted besides the options.
    #[serde(default = "yes")]
    pub allow_free_text: bool,
}

fn yes() -> bool {
    true
}

/// The agent asks the user one or more questions (Claude's AskUserQuestion,
/// Codex's request for user input).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuestionSet {
    pub request_id: String,
    pub questions: Vec<Question>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolution: Option<Resolution>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Tone {
    Info,
    Warning,
    Error,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub text: String,
    pub tone: Tone,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TurnState {
    Running,
    Completed,
    Interrupted,
    Failed,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_tokens: u64,
    #[serde(default)]
    pub cache_write_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Turn {
    pub turn_id: String,
    pub state: TurnState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
}

/// The user's reply to an approval or question. `rename_all_fields` too: on an
/// enum `rename_all` renames only the variant tags, which left `option_id`
/// snake_case on the wire while types.ts sends `optionId`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Answer {
    /// The chosen `ApprovalOption::id`, with an optional note for a denial.
    Approval {
        option_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        note: Option<String>,
    },
    /// Per `Question::id`: the chosen option labels, or typed text.
    Questions {
        answers: std::collections::BTreeMap<String, Vec<String>>,
    },
}

/// Longest tool output or file text kept in a row; longer is cut with a marker.
pub const CAP_CHARS: usize = 20_000;

/// `text`, cut to `CAP_CHARS` characters with a note saying how much was dropped.
pub fn cap(text: &str) -> String {
    let total = text.chars().count();
    if total <= CAP_CHARS {
        return text.to_string();
    }
    let kept: String = text.chars().take(CAP_CHARS).collect();
    format!("{kept}\n… ({} more characters)", total - CAP_CHARS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rows_serialise_with_a_kind_tag_and_camel_case() {
        let row = JournalRow {
            id: "t1".into(),
            revision: 2,
            seq: 7,
            at: 1,
            turn_id: Some("turn-1".into()),
            body: JournalBody::Tool(ToolCall {
                call_id: "c1".into(),
                name: "Bash".into(),
                input: json!({"command": "ls"}),
                state: ToolState::Completed,
                output: Some("a.txt".into()),
                parent_call_id: None,
            }),
        };
        let v = serde_json::to_value(&row).unwrap();
        assert_eq!(v["body"]["kind"], "tool");
        assert_eq!(v["body"]["callId"], "c1");
        assert_eq!(v["body"]["state"], "completed");
        assert_eq!(v["turnId"], "turn-1");
        assert_eq!(serde_json::from_value::<JournalRow>(v).unwrap(), row);
    }

    #[test]
    fn a_diff_keeps_its_change_beside_the_kind_tag() {
        let body = JournalBody::Diff(FileDiff {
            call_id: None,
            path: "a.rs".into(),
            change: ChangeKind::Add,
            before: None,
            after: Some("fn main() {}".into()),
            patch: None,
        });
        let v = serde_json::to_value(&body).unwrap();
        assert_eq!(v["kind"], "diff");
        assert_eq!(v["change"], "add");
        assert_eq!(serde_json::from_value::<JournalBody>(v).unwrap(), body);
    }

    #[test]
    fn answers_and_resolutions_round_trip() {
        let answer = Answer::Questions {
            answers: [("q1".to_string(), vec!["Yes".to_string()])].into(),
        };
        let v = serde_json::to_value(Resolution::Answered { answer }).unwrap();
        assert_eq!(v["state"], "answered");
        assert_eq!(v["answer"]["kind"], "questions");
        assert_eq!(v["answer"]["answers"]["q1"][0], "Yes");
    }

    #[test]
    fn answers_read_what_types_ts_sends() {
        let sent = json!({"kind": "approval", "optionId": "always:0", "note": "ok"});
        let answer: Answer = serde_json::from_value(sent.clone()).unwrap();
        assert_eq!(
            answer,
            Answer::Approval {
                option_id: "always:0".into(),
                note: Some("ok".into()),
            }
        );
        assert_eq!(serde_json::to_value(&answer).unwrap(), sent);
    }

    #[test]
    fn cap_keeps_short_text_and_marks_cut_text() {
        assert_eq!(cap("hi"), "hi");
        let long = "x".repeat(CAP_CHARS + 5);
        let cut = cap(&long);
        assert!(cut.ends_with("(5 more characters)"));
        assert!(cut.starts_with(&"x".repeat(CAP_CHARS)));
    }
}
