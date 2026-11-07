//! Codex's sub-agents (`multi_agent`): a `collabAgentToolCall` `spawnAgent` item
//! starts one on a thread of its own, named in `receiverThreadIds` once the
//! spawn completes. That thread's notifications arrive on the same connection;
//! they become rows with `parentCallId` (the spawn's item id), filed under the
//! spawning turn, and the thread's `turn/completed` ends the subagent. `wait`
//! items report each agent's status too. Recorded: `fixtures/subagents.jsonl`.

use serde_json::{json, Value};

use super::{str_at, Call, Out, Translator};
use crate::agent_session::journal::{cap, JournalBody, Subagent, SubagentState};

/// A spawned agent, by the spawn call's item id.
pub(super) struct Spawn {
    /// The turn its rows are filed under.
    pub turn: String,
    /// Its own thread, once the spawn completes.
    pub thread: Option<String>,
    /// Codex's id for the thread's running turn, for interrupting it.
    pub codex_turn: Option<String>,
    /// Its latest message: the report, once it's done.
    pub last_text: Option<String>,
    pub running: bool,
}

/// The tool row name and input for a collab call.
pub(super) fn collab_tool(item: &Value) -> (String, Value) {
    let name = match str_at(item, "tool") {
        Some("spawnAgent") => "spawn_agent",
        Some("wait") => "wait_agent",
        Some("sendInput") => "send_input",
        Some("resumeAgent") => "resume_agent",
        Some("closeAgent") => "close_agent",
        _ => "agent",
    };
    let input = json!({
        "prompt": str_at(item, "prompt").map(cap),
        "model": str_at(item, "model"),
        "agents": item["receiverThreadIds"],
    });
    (name.to_string(), input)
}

/// A few words on a spawned agent's job: its prompt's first line.
fn description(prompt: Option<&str>) -> Option<String> {
    let line = prompt?.trim().lines().next()?.trim();
    let mut short: String = line.chars().take(80).collect();
    if short.len() < line.len() {
        short.push('…');
    }
    (!short.is_empty()).then_some(short)
}

impl Translator {
    /// The turn a row belongs to: its sub-agent's, else the open one.
    pub(super) fn row_turn(&mut self, out: &mut Vec<Out>) -> String {
        if let Some(spawn) = self.parent.as_ref().and_then(|c| self.spawns.get(c)) {
            return spawn.turn.clone();
        }
        self.turn_id(out)
    }

    /// The subagent a collab item's row carries: a new one for a spawn
    /// starting, the open row's as it was otherwise.
    pub(super) fn collab_subagent(
        &mut self,
        id: &str,
        item: &Value,
        out: &mut Vec<Out>,
    ) -> Option<Subagent> {
        if str_at(item, "tool") != Some("spawnAgent") {
            return None;
        }
        let known = match self.book.get(&format!("tool:{id}")).map(|r| &r.body) {
            Some(JournalBody::Tool(t)) => t.subagent.as_deref().cloned(),
            _ => None,
        };
        if let Some(s) = known {
            return Some(s);
        }
        let turn = self.row_turn(out);
        let spawn = Spawn {
            turn,
            thread: None,
            codex_turn: None,
            last_text: None,
            running: true,
        };
        self.spawns.insert(id.to_string(), spawn);
        self.count_subagents(out);
        Some(Subagent::running(
            None,
            description(str_at(item, "prompt")),
            false,
        ))
    }

    /// A collab item finished: a spawn names its thread, a wait reports states.
    pub(super) fn collab_done(&mut self, id: &str, item: &Value, out: &mut Vec<Out>) {
        match str_at(item, "tool") {
            Some("spawnAgent") if str_at(item, "status") == Some("failed") => {
                self.end_spawn(id, SubagentState::Failed, out);
            }
            Some("spawnAgent") => {
                let thread = item["receiverThreadIds"][0].as_str().map(str::to_string);
                if let (Some(thread), Some(spawn)) = (thread, self.spawns.get_mut(id)) {
                    spawn.thread = Some(thread.clone());
                    self.threads.insert(thread, id.to_string());
                }
            }
            _ => {}
        }
        let Some(states) = item["agentsStates"].as_object() else {
            return;
        };
        for (thread, s) in states {
            let Some(call) = self.threads.get(thread).cloned() else {
                continue;
            };
            let state = match str_at(s, "status") {
                Some("completed") => SubagentState::Completed,
                Some("errored") => SubagentState::Failed,
                Some("interrupted" | "shutdown" | "notFound") => SubagentState::Stopped,
                _ => continue,
            };
            if let (Some(text), Some(spawn)) = (str_at(s, "message"), self.spawns.get_mut(&call)) {
                spawn.last_text = Some(text.to_string());
            }
            self.end_spawn(&call, state, out);
        }
    }

    /// A notification from a sub-agent's thread. Its items become rows under
    /// the spawn; its turn's end is the sub-agent's.
    pub(super) fn child_notification(
        &mut self,
        call: String,
        method: &str,
        p: &Value,
        out: &mut Vec<Out>,
    ) {
        match method {
            "turn/started" => {
                let codex = str_at(&p["turn"], "id").map(str::to_string);
                if let Some(spawn) = self.spawns.get_mut(&call) {
                    spawn.codex_turn = codex;
                }
            }
            "turn/completed" => {
                let state = match str_at(&p["turn"], "status") {
                    Some("failed") => SubagentState::Failed,
                    Some("interrupted") => SubagentState::Stopped,
                    _ => SubagentState::Completed,
                };
                self.end_spawn(&call, state, out);
            }
            "item/started"
            | "item/completed"
            | "item/agentMessage/delta"
            | "item/reasoning/summaryTextDelta"
            | "item/reasoning/textDelta"
            | "item/commandExecution/outputDelta" => {
                self.parent = Some(call);
                self.notification(method, p, out);
                self.parent = None;
            }
            _ => {}
        }
    }

    /// A sub-agent's message: the latest is its report.
    pub(super) fn note_child_text(&mut self, text: &str) {
        if let Some(spawn) = self.parent.as_ref().and_then(|c| self.spawns.get_mut(c)) {
            spawn.last_text = Some(text.to_string());
        }
    }

    /// `turn/interrupt` for each running sub-agent's turn, or just `call`'s.
    pub(super) fn interrupt_children(&mut self, only: Option<&str>, out: &mut Vec<Out>) {
        let targets: Vec<(String, String)> = self
            .spawns
            .iter()
            .filter(|(c, s)| s.running && only.is_none_or(|o| o == c.as_str()))
            .filter_map(|(_, s)| Some((s.thread.clone()?, s.codex_turn.clone()?)))
            .collect();
        for (thread, turn) in targets {
            let params = json!({"threadId": thread, "turnId": turn});
            out.push(self.request(Call::Interrupt, "turn/interrupt", params));
        }
    }

    /// Stop one sub-agent.
    pub fn stop_subagent(&mut self, call: &str) -> Result<Vec<Out>, String> {
        let spawn = self
            .spawns
            .get(call)
            .filter(|s| s.running)
            .ok_or("That subagent isn't running.")?;
        if spawn.codex_turn.is_none() {
            return Err("Codex hasn't started that subagent's turn yet.".to_string());
        }
        let mut out = Vec::new();
        self.interrupt_children(Some(call), &mut out);
        Ok(out)
    }

    /// Every running sub-agent ends as `state` (Codex went away).
    pub(super) fn end_spawns(&mut self, state: SubagentState, out: &mut Vec<Out>) {
        let running: Vec<String> = self
            .spawns
            .iter()
            .filter(|(_, s)| s.running)
            .map(|(c, _)| c.clone())
            .collect();
        for call in running {
            self.end_spawn(&call, state, out);
        }
    }

    /// Whether an open row must stay open past its turn: a running sub-agent's.
    pub(super) fn outlives_turn(&self, body: &JournalBody) -> bool {
        let running = |c: &Option<String>| {
            c.as_ref()
                .and_then(|c| self.spawns.get(c))
                .is_some_and(|s| s.running)
        };
        match body {
            JournalBody::Tool(t) => {
                running(&t.parent_call_id) || self.spawns.get(&t.call_id).is_some_and(|s| s.running)
            }
            JournalBody::Message(m) => running(&m.parent_call_id),
            _ => false,
        }
    }

    pub(super) fn count_subagents(&mut self, out: &mut Vec<Out>) {
        let n = self.spawns.values().filter(|s| s.running).count() as u32;
        self.set_info(out, |i| i.running_subagents = n);
    }

    fn end_spawn(&mut self, call: &str, state: SubagentState, out: &mut Vec<Out>) {
        let Some(spawn) = self.spawns.get_mut(call).filter(|s| s.running) else {
            return;
        };
        spawn.running = false;
        let report = (state == SubagentState::Completed)
            .then(|| spawn.last_text.as_deref().map(cap))
            .flatten();
        let id = format!("tool:{call}");
        let row = self.book.update(&id, |body| {
            if let JournalBody::Tool(t) = body {
                if let Some(s) = t.subagent.as_mut() {
                    s.state = state;
                    s.result = report.or(s.result.take());
                }
            }
        });
        out.extend(row.map(Out::Row));
        // Past its turn nothing else closes it, or what it left open.
        if self.turn.is_none() {
            self.book.retire(&id);
            let mine = |b: &JournalBody| match b {
                JournalBody::Tool(t) => t.parent_call_id.as_deref() == Some(call),
                JournalBody::Message(m) => m.parent_call_id.as_deref() == Some(call),
                _ => false,
            };
            for open in self.book.open_ids(mine) {
                self.book.retire(&open);
            }
        }
        self.count_subagents(out);
    }
}
