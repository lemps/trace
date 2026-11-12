//! Codex's prompts: server→client JSON-RPC requests that wait on the user. A
//! command or file-change approval becomes an approval row offering what Codex
//! offers (`availableDecisions`), a request for user input a question row; the
//! answer goes back as that request's response.

use serde_json::{json, Value};

use super::translate::{patch_text, str_at};
use crate::agent_session::journal::{
    cap, Answer, Approval, ApprovalKind, ApprovalOption, Question, QuestionOption, QuestionSet,
};

/// What answering a prompt needs.
pub struct Pending {
    pub row_id: String,
    /// The request's JSON-RPC id, echoed in the response.
    pub rpc_id: Value,
    kind: Kind,
}

enum Kind {
    /// Each option's id and the `decision` it sends.
    Approval(Vec<(String, Value)>),
    /// The questions' ids, each answered in the response.
    Questions(Vec<String>),
}

/// Older Codex builds don't send `availableDecisions`; these are what v2 takes.
const FALLBACK: [&str; 4] = ["accept", "acceptForSession", "decline", "cancel"];

/// An approval row for `item/commandExecution/requestApproval` or
/// `item/fileChange/requestApproval`. `item` is the file change's
/// `item/started`, which holds the patch the request doesn't.
pub fn approval(
    request_id: &str,
    rpc_id: &Value,
    method: &str,
    p: &Value,
    item: Option<&Value>,
) -> (Approval, Pending) {
    let decisions: Vec<Value> = match p["availableDecisions"].as_array() {
        Some(offered) if !offered.is_empty() => offered.clone(),
        _ => FALLBACK.iter().map(|d| json!(d)).collect(),
    };
    let mut options = Vec::new();
    let mut sends = Vec::new();
    for (i, decision) in decisions.iter().enumerate() {
        if let Some((id, label, kind)) = option_for(i, decision) {
            options.push(ApprovalOption {
                id: id.clone(),
                label,
                kind,
            });
            sends.push((id, decision.clone()));
        }
    }
    // Codex may offer only `cancel` (deny and end the turn); `decline` (deny and
    // carry on) is always accepted too, and is the gentler answer to offer.
    if !sends.iter().any(|(id, _)| id == "decline") {
        let at = sends
            .iter()
            .position(|(id, _)| id == "cancel")
            .unwrap_or(sends.len());
        let deny = ApprovalOption {
            id: "decline".to_string(),
            label: "Deny".to_string(),
            kind: ApprovalKind::Deny,
        };
        options.insert(at, deny);
        sends.insert(at, ("decline".to_string(), json!("decline")));
    }
    let reason = str_at(p, "reason").filter(|r| !r.is_empty());
    let (tool, title, detail) = if method == "item/fileChange/requestApproval" {
        let changes = item.map(|i| &i["changes"]).unwrap_or(&Value::Null);
        let files: Vec<&str> = changes
            .as_array()
            .map(|c| c.iter().filter_map(|c| str_at(c, "path")).collect())
            .unwrap_or_default();
        let title = match files.as_slice() {
            [one] => format!("Edit {one}"),
            [] => "Change files".to_string(),
            many => format!("Edit {} files", many.len()),
        };
        let mut detail = Vec::new();
        if let Some(root) = str_at(p, "grantRoot") {
            detail.push(format!("Write access: {root}"));
        }
        if !files.is_empty() {
            detail.push(patch_text(changes));
        }
        ("apply_patch", title, detail)
    } else {
        let raw = str_at(p, "command").unwrap_or_default();
        let shown = match p["commandActions"].as_array().map(Vec::as_slice) {
            Some([only]) => str_at(only, "command").unwrap_or(raw),
            _ => raw,
        };
        let title = match str_at(&p["networkApprovalContext"], "host") {
            Some(host) => format!("Allow network access to {host}"),
            None => format!("Run {shown}"),
        };
        ("shell", title, vec![raw.to_string()])
    };
    let detail: Vec<String> = reason
        .map(str::to_string)
        .into_iter()
        .chain(detail.into_iter().filter(|d| !d.is_empty()))
        .collect();
    let approval = Approval {
        request_id: request_id.to_string(),
        call_id: str_at(p, "itemId").map(str::to_string),
        tool: tool.to_string(),
        title: cap(&title),
        detail: (!detail.is_empty()).then(|| cap(&detail.join("\n\n"))),
        options,
        resolution: None,
    };
    let pending = Pending {
        row_id: format!("approval:{request_id}"),
        rpc_id: rpc_id.clone(),
        kind: Kind::Approval(sends),
    };
    (approval, pending)
}

/// The option a decision is offered as: (id, label, kind). `None` for one
/// trace can't show.
fn option_for(i: usize, decision: &Value) -> Option<(String, String, ApprovalKind)> {
    let simple = |id: &str, label: &str, kind| Some((id.to_string(), label.to_string(), kind));
    if let Some(name) = decision.as_str() {
        return match name {
            "accept" => simple("accept", "Allow once", ApprovalKind::AllowOnce),
            "acceptForSession" => simple(
                "acceptForSession",
                "Allow for this session",
                ApprovalKind::AllowAlways,
            ),
            "decline" => simple("decline", "Deny", ApprovalKind::Deny),
            "cancel" => simple("cancel", "Deny and stop", ApprovalKind::Deny),
            _ => None,
        };
    }
    if let Some(a) = decision.get("acceptWithExecpolicyAmendment") {
        let words: Vec<&str> = a["execpolicy_amendment"]
            .as_array()?
            .iter()
            .filter_map(Value::as_str)
            .collect();
        let label = format!("Always allow `{}`", words.join(" "));
        return Some((format!("amend:{i}"), label, ApprovalKind::AllowAlways));
    }
    if let Some(a) = decision.get("applyNetworkPolicyAmendment") {
        let rule = &a["network_policy_amendment"];
        let host = str_at(rule, "host")?;
        return Some(match str_at(rule, "action") {
            Some("deny") => (
                format!("network:{i}"),
                format!("Always block {host}"),
                ApprovalKind::Deny,
            ),
            _ => (
                format!("network:{i}"),
                format!("Always allow {host}"),
                ApprovalKind::AllowAlways,
            ),
        });
    }
    None
}

/// A question row for `item/tool/requestUserInput`.
pub fn questions(request_id: &str, rpc_id: &Value, p: &Value) -> (QuestionSet, Pending) {
    let asked = p["questions"].as_array().cloned().unwrap_or_default();
    let questions: Vec<Question> = asked
        .iter()
        .enumerate()
        .map(|(i, q)| {
            let options: Vec<QuestionOption> = q["options"]
                .as_array()
                .map(|o| {
                    o.iter()
                        .filter_map(|o| {
                            Some(QuestionOption {
                                label: str_at(o, "label")?.to_string(),
                                description: str_at(o, "description")
                                    .filter(|d| !d.is_empty())
                                    .map(str::to_string),
                                // Codex's request for input has no previews.
                                preview: None,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            Question {
                id: str_at(q, "id").map_or_else(|| format!("q{i}"), str::to_string),
                header: str_at(q, "header")
                    .filter(|h| !h.is_empty())
                    .map(str::to_string),
                text: str_at(q, "question").unwrap_or_default().to_string(),
                allow_free_text: options.is_empty() || q["isOther"].as_bool().unwrap_or(false),
                options,
                multi_select: false,
            }
        })
        .collect();
    let ids = questions.iter().map(|q| q.id.clone()).collect();
    let set = QuestionSet {
        request_id: request_id.to_string(),
        questions,
        resolution: None,
    };
    let pending = Pending {
        row_id: format!("question:{request_id}"),
        rpc_id: rpc_id.clone(),
        kind: Kind::Questions(ids),
    };
    (set, pending)
}

/// The JSON-RPC response that answers `pending` with `answer`.
pub fn response(pending: &Pending, answer: &Answer) -> Result<Value, String> {
    let result = match (&pending.kind, answer) {
        (Kind::Approval(sends), Answer::Approval { option_id, .. }) => {
            let (_, decision) = sends
                .iter()
                .find(|(id, _)| id == option_id)
                .ok_or("That isn't one of this prompt's options.")?;
            json!({"decision": decision})
        }
        (Kind::Questions(ids), Answer::Questions { answers }) => {
            let answers: serde_json::Map<String, Value> = ids
                .iter()
                .map(|id| {
                    let given = answers.get(id).cloned().unwrap_or_default();
                    (id.clone(), json!({"answers": given}))
                })
                .collect();
            json!({"answers": answers})
        }
        _ => return Err("That answer doesn't fit this prompt.".to_string()),
    };
    Ok(json!({"id": pending.rpc_id, "result": result}))
}
