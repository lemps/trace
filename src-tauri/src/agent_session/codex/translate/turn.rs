//! A turn's lifecycle. The user's message opens it (a user row and a running
//! turn row) and goes to Codex as `turn/start`, or as `turn/steer` into the
//! turn already running; `turn/completed` closes it. An interrupt or the
//! process ending closes it early. Whatever was still open then is settled:
//! streaming text stops, unanswered prompts are cancelled, running tools fail.

use serde_json::{json, Value};

use super::{str_at, Call, OpenTurn, Out, Translator};
use crate::agent_session::journal::{
    JournalBody, Message, Plan, PlanItem, PlanStatus, Resolution, Role, SubagentState, Tone,
    ToolState, Turn, TurnState, Usage,
};

impl Translator {
    /// The open turn's id, opening one if Codex started work without a message
    /// from us (a turn already running on a resumed thread).
    pub(super) fn turn_id(&mut self, out: &mut Vec<Out>) -> String {
        if let Some(turn) = &self.turn {
            return turn.id.clone();
        }
        let id = format!("turn-{}", self.book.next_seq());
        let body = turn_body(&id, TurnState::Running, None, None);
        let row = self.book.put(&format!("turn:{id}"), Some(&id), body);
        out.push(Out::Row(row));
        self.turn = Some(OpenTurn {
            id: id.clone(),
            codex: None,
            starting: false,
            interrupting: false,
            steer_refused: false,
            usage: Usage::default(),
            error_shown: false,
        });
        self.set_info(out, |i| i.busy = true);
        id
    }

    /// A user turn: its row (the text, with its `attachments` drawn under it), and
    /// `input` (Codex's `UserInput` items) on its way as soon as there's a thread.
    pub fn send(&mut self, text: &str, attachments: &[String], input: Vec<Value>) -> Vec<Out> {
        let mut out = Vec::new();
        let turn = self.turn_id(&mut out);
        let id = format!("user:{}", self.book.next_seq());
        let body = JournalBody::Message(Message {
            role: Role::User,
            text: text.to_string(),
            streaming: false,
            parent_call_id: None,
            attachments: attachments.to_vec(),
        });
        out.push(Out::Row(self.book.put(&id, Some(&turn), body)));
        self.book.retire(&id);
        self.queue.push_back(input);
        self.pump(&mut out);
        out
    }

    /// Hand queued input to Codex: a new turn, or steering the running one.
    /// Waits while there's no thread, or a `turn/start` hasn't answered.
    pub(super) fn pump(&mut self, out: &mut Vec<Out>) {
        while !self.queue.is_empty() {
            let Some(thread) = self.thread.clone() else {
                return;
            };
            self.turn_id(out);
            let Some(turn) = self.turn.as_mut() else {
                return;
            };
            if turn.starting || turn.interrupting || turn.steer_refused {
                return;
            }
            let input = self.queue.pop_front().unwrap_or_default();
            match turn.codex.clone() {
                Some(codex) => {
                    let params =
                        json!({"threadId": thread, "input": input, "expectedTurnId": codex});
                    let frame = self.request(Call::Steer(input), "turn/steer", params);
                    out.push(frame);
                }
                None => {
                    turn.starting = true;
                    let params = json!({"threadId": thread, "input": input});
                    out.push(self.request(Call::TurnStart, "turn/start", params));
                    return;
                }
            }
        }
    }

    /// Stop the running turn. Before Codex has it, it never starts.
    /// Running sub-agents are interrupted too.
    pub fn interrupt(&mut self) -> Vec<Out> {
        let mut out = Vec::new();
        self.interrupt_children(None, &mut out);
        let Some(turn) = self.turn.as_mut() else {
            return out;
        };
        turn.interrupting = true;
        match (turn.codex.clone(), turn.starting) {
            (Some(codex), _) => self.send_interrupt(&codex, &mut out),
            // `turn/start`'s answer sends it.
            (None, true) => {}
            (None, false) => {
                self.queue.clear();
                self.end_turn(TurnState::Interrupted, None, &mut out);
            }
        }
        out
    }

    fn send_interrupt(&mut self, codex: &str, out: &mut Vec<Out>) {
        let Some(thread) = self.thread.clone() else {
            return;
        };
        let params = json!({"threadId": thread, "turnId": codex});
        out.push(self.request(Call::Interrupt, "turn/interrupt", params));
    }

    /// `turn/start` answered with Codex's turn.
    pub(super) fn turn_accepted(&mut self, turn: &Value, out: &mut Vec<Out>) {
        let codex = str_at(turn, "id").map(str::to_string);
        self.adopt(codex, out);
        self.pump(out);
    }

    /// `turn/started`: Codex's own announcement, for ours or one it began.
    pub(super) fn turn_started(&mut self, turn: &Value, out: &mut Vec<Out>) {
        let codex = str_at(turn, "id").map(str::to_string);
        if self.turn.as_ref().is_some_and(|t| t.codex.is_some()) {
            return;
        }
        if self.turn.as_ref().is_some_and(|t| t.starting) {
            // Ours; `turn/start`'s answer is on its way and adopts it.
            return;
        }
        self.turn_id(out);
        self.adopt(codex, out);
    }

    fn adopt(&mut self, codex: Option<String>, out: &mut Vec<Out>) {
        let Some(turn) = self.turn.as_mut() else {
            return;
        };
        turn.starting = false;
        turn.codex = codex.or(turn.codex.take());
        if let (true, Some(codex)) = (turn.interrupting, turn.codex.clone()) {
            self.send_interrupt(&codex, out);
        }
    }

    pub(super) fn turn_refused(&mut self, text: &str, out: &mut Vec<Out>) {
        self.status(text, Tone::Error, out);
        self.end_turn(TurnState::Failed, None, out);
        self.pump(out);
    }

    /// The handshake failed: nothing queued will ever run.
    pub(super) fn refuse_queue(&mut self, out: &mut Vec<Out>) {
        self.queue.clear();
        self.end_turn(TurnState::Failed, None, out);
    }

    pub(super) fn turn_completed(&mut self, turn: &Value, out: &mut Vec<Out>) {
        let codex = str_at(turn, "id");
        let ours = self
            .turn
            .as_ref()
            .is_some_and(|t| t.codex.is_none() || t.codex.as_deref() == codex || codex.is_none());
        if !ours {
            return;
        }
        let state = match str_at(turn, "status") {
            Some("interrupted") => TurnState::Interrupted,
            Some("failed") => TurnState::Failed,
            _ if self.turn.as_ref().is_some_and(|t| t.interrupting) => TurnState::Interrupted,
            _ => TurnState::Completed,
        };
        let shown = self.turn.as_ref().is_some_and(|t| t.error_shown);
        if state == TurnState::Failed && !shown {
            let text = match turn.get("error").filter(|e| !e.is_null()) {
                Some(e) => super::error_text(e),
                None => "The turn failed.".to_string(),
            };
            self.status(&text, Tone::Error, out);
        }
        self.end_turn(state, turn["durationMs"].as_u64(), out);
        self.pump(out);
    }

    /// Codex's process ended. `reason` is set when nobody asked it to.
    pub fn exited(&mut self, reason: Option<&str>) -> Vec<Out> {
        let mut out = Vec::new();
        if let Some(turn) = &self.turn {
            let state = match (reason, turn.interrupting) {
                (_, true) | (None, _) => TurnState::Interrupted,
                (Some(_), false) => TurnState::Failed,
            };
            self.end_turn(state, None, &mut out);
        }
        self.end_spawns(SubagentState::Stopped, &mut out);
        if let Some(reason) = reason {
            self.status(reason, Tone::Error, &mut out);
        }
        self.set_info(&mut out, |i| i.busy = false);
        out
    }

    /// Close the open turn, settling what it left open.
    fn end_turn(&mut self, state: TurnState, duration_ms: Option<u64>, out: &mut Vec<Out>) {
        let Some(turn) = self.turn.take() else {
            return;
        };
        let streams = std::mem::take(&mut self.streams);
        for (item, s) in streams {
            let child = s.parent.as_ref().and_then(|c| self.spawns.get(c));
            if child.is_some_and(|x| x.running) {
                // A sub-agent still at work keeps talking past the turn.
                self.streams.insert(item, s);
                continue;
            }
            if self.book.get(&s.row_id).is_some() {
                out.push(Out::Row(self.book.put(&s.row_id, None, message(&s))));
            }
        }
        let open: Vec<String> = self.pending.keys().cloned().collect();
        for request_id in open {
            self.cancel_prompt(&request_id, out);
        }
        if state != TurnState::Completed {
            let running = self.book.open_ids(|b| {
                matches!(b, JournalBody::Tool(t) if t.state == ToolState::Running)
                    && !self.outlives_turn(b)
            });
            for id in running {
                let row = self.book.update(&id, |body| {
                    if let JournalBody::Tool(t) = body {
                        t.state = ToolState::Failed;
                        t.output.get_or_insert_with(|| "Interrupted.".to_string());
                    }
                });
                out.extend(row.map(Out::Row));
            }
        }
        // Nothing of this turn changes any more, but a sub-agent still running.
        let id = format!("turn:{}", turn.id);
        for open in self.book.open_ids(|b| !self.outlives_turn(b)) {
            if open != id {
                self.book.retire(&open);
            }
        }
        self.started.clear();
        let body = turn_body(&turn.id, state, duration_ms, Some(turn.usage));
        out.push(Out::Row(self.book.put(&id, Some(&turn.id), body)));
        self.book.retire(&id);
        self.set_info(out, |i| i.busy = false);
    }

    /// Withdraw a prompt: Codex resolved it itself, or its turn ended unanswered.
    pub(super) fn cancel_prompt(&mut self, request_id: &str, out: &mut Vec<Out>) {
        if let Some(pending) = self.pending.remove(request_id) {
            self.resolve(&pending.row_id, Resolution::Cancelled, out);
        }
    }

    pub(super) fn resolve(&mut self, row_id: &str, resolution: Resolution, out: &mut Vec<Out>) {
        let row = self.book.update(row_id, |body| match body {
            JournalBody::Approval(a) => a.resolution = Some(resolution),
            JournalBody::Question(q) => q.resolution = Some(resolution),
            _ => {}
        });
        out.extend(row.map(Out::Row));
        self.book.retire(row_id);
    }

    /// `turn/plan/updated`: the turn's task list, one row revised in place.
    pub(super) fn plan(&mut self, p: &Value, out: &mut Vec<Out>) {
        let items: Vec<PlanItem> = p["plan"]
            .as_array()
            .map(|steps| {
                steps
                    .iter()
                    .filter_map(|s| {
                        let status = match str_at(s, "status")? {
                            "completed" => PlanStatus::Done,
                            "inProgress" => PlanStatus::InProgress,
                            _ => PlanStatus::Pending,
                        };
                        let text = str_at(s, "step")?.to_string();
                        Some(PlanItem { text, status })
                    })
                    .collect()
            })
            .unwrap_or_default();
        let turn = self.turn_id(out);
        let body = JournalBody::Plan(Plan { items });
        out.push(Out::Row(self.book.put(
            &format!("plan:{turn}"),
            Some(&turn),
            body,
        )));
    }
}

/// A stream's final text as a settled message.
pub(super) fn message(s: &super::Stream) -> JournalBody {
    JournalBody::Message(Message {
        role: s.role,
        text: s.text.clone(),
        streaming: false,
        parent_call_id: s.parent.clone(),
        attachments: Vec::new(),
    })
}

fn turn_body(
    id: &str,
    state: TurnState,
    duration_ms: Option<u64>,
    usage: Option<Usage>,
) -> JournalBody {
    JournalBody::Turn(Turn {
        turn_id: id.to_string(),
        state,
        duration_ms,
        usage,
    })
}
