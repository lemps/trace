//! Requests Codex sends us. Approvals and requests for user input become rows
//! that wait on the user (`prompts`); everything else is answered at once so
//! Codex never waits on something trace doesn't show.

use serde_json::{json, Value};

use super::{Out, Translator};
use crate::agent_session::codex::prompts;
use crate::agent_session::journal::{Answer, JournalBody, Resolution};

impl Translator {
    pub(super) fn server_request(
        &mut self,
        method: &str,
        rpc_id: &Value,
        p: &Value,
        out: &mut Vec<Out>,
    ) {
        let reply = |result: Value| Out::Send(json!({"id": rpc_id, "result": result}));
        match method {
            "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => {
                let turn = self.turn_id(out);
                let request_id = format!("codex-{}", self.book.next_seq());
                let item = p["itemId"].as_str().and_then(|id| self.started.get(id));
                let (approval, pending) = prompts::approval(&request_id, rpc_id, method, p, item);
                let body = JournalBody::Approval(approval);
                out.push(Out::Row(self.book.put(&pending.row_id, Some(&turn), body)));
                self.pending.insert(request_id, pending);
            }
            "item/tool/requestUserInput" => {
                let turn = self.turn_id(out);
                let request_id = format!("codex-{}", self.book.next_seq());
                let (set, pending) = prompts::questions(&request_id, rpc_id, p);
                let body = JournalBody::Question(set);
                out.push(Out::Row(self.book.put(&pending.row_id, Some(&turn), body)));
                self.pending.insert(request_id, pending);
            }
            // trace shows no MCP forms: decline, and the tool call goes on without.
            "mcpServer/elicitation/request" => {
                out.push(reply(
                    json!({"action": "decline", "content": null, "_meta": null}),
                ));
            }
            // Grant nothing beyond the sandbox the thread has.
            "item/permissions/requestApproval" => {
                out.push(reply(json!({"permissions": {}, "scope": "turn"})));
            }
            "item/tool/call" => out.push(reply(json!({"contentItems": [], "success": false}))),
            // v1 approvals; a v2 thread sends the ones above.
            "applyPatchApproval" | "execCommandApproval" => {
                out.push(reply(json!({"decision": "abort"})));
            }
            _ => out.push(Out::Send(json!({
                "id": rpc_id,
                "error": {"code": -32601, "message": "Not supported by trace."},
            }))),
        }
    }

    /// Answer an open approval or question.
    pub fn answer(&mut self, request_id: &str, answer: Answer) -> Result<Vec<Out>, String> {
        let pending = self
            .pending
            .remove(request_id)
            .ok_or("That prompt isn't open any more.")?;
        let reply = match prompts::response(&pending, &answer) {
            Ok(reply) => reply,
            Err(e) => {
                self.pending.insert(request_id.to_string(), pending);
                return Err(e);
            }
        };
        let mut out = vec![Out::Send(reply)];
        self.resolve(&pending.row_id, Resolution::Answered { answer }, &mut out);
        Ok(out)
    }

    /// `serverRequest/resolved`: Codex settled a request itself (its turn was
    /// interrupted). One we answered is already gone.
    pub(super) fn resolved(&mut self, rpc_id: &Value, out: &mut Vec<Out>) {
        let open = self
            .pending
            .iter()
            .find(|(_, p)| &p.rpc_id == rpc_id)
            .map(|(id, _)| id.clone());
        if let Some(request_id) = open {
            self.cancel_prompt(&request_id, out);
        }
    }
}
