//! `codex app-server`'s JSON-RPC, frame by frame, as journal rows. Pure: no
//! process, no IO, so the fixture tests drive it with recorded frames. What the
//! adapter must write back comes out as `Out::Send`.
//!
//! The conversation: `initialize`, then `thread/start` (or `thread/resume` of a
//! saved thread, falling back to a fresh one when Codex never saved it), then a
//! `turn/start` per user message (`turn/steer` while one runs).
//!
//! - `item/*` notifications → message, reasoning, tool and diff rows (`items`).
//! - Server requests (approvals, user input) → approval and question rows
//!   (`prompts`), answered with the request's JSON-RPC response.
//! - `turn/*`, `thread/tokenUsage/updated` → the turn row (`turn`) and the
//!   context gauge (`session`);
//!   `account/rateLimits/updated`, `warning`, `error` → `SessionInfo` and
//!   status rows (`session`).

mod agents;
mod items;
mod options;
mod requests;
mod session;
mod turn;

pub(in crate::agent_session::codex) use items::patch_text;

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::{json, Value};

use super::args::ThreadSettings;
use super::prompts::Pending;
use crate::agent_session::claude::book::RowBook;
use crate::agent_session::journal::{Role, Tone, Usage};
use crate::agent_session::SessionInfo;

/// What a frame (or a user action) produced.
#[derive(Debug, PartialEq)]
pub enum Out {
    Row(crate::agent_session::journal::JournalRow),
    Info(SessionInfo),
    /// A JSON-RPC frame to write to Codex's stdin.
    Send(Value),
}

/// The requests of ours still waiting on a response, by JSON-RPC id.
enum Call {
    Initialize,
    ThreadStart,
    ThreadResume,
    TurnStart,
    /// A message for the running turn; started as a turn of its own if that
    /// turn already ended.
    Steer(Vec<Value>),
    Interrupt,
}

/// One agent's translation state. Owned by the adapter's thread, never shared.
pub struct Translator {
    book: RowBook,
    info: SessionInfo,
    settings: ThreadSettings,
    /// A saved thread to resume instead of starting one.
    resume: Option<String>,
    thread: Option<String>,
    next_id: u64,
    calls: HashMap<u64, Call>,
    /// User inputs not yet given to Codex: no thread yet, or a turn starting.
    queue: VecDeque<Vec<Value>>,
    turn: Option<OpenTurn>,
    /// Text and reasoning items still streaming, by item id.
    streams: HashMap<String, Stream>,
    /// Started items' details a later frame needs (a patch for its approval).
    started: HashMap<String, Value>,
    /// Prompts awaiting the user, by `request_id`.
    pending: HashMap<String, Pending>,
    /// Warnings already shown: Codex repeats some every turn.
    warned: HashSet<String>,
    /// Sub-agents by their spawn call's item id, and their threads → that id.
    spawns: HashMap<String, agents::Spawn>,
    threads: HashMap<String, String>,
    /// The spawn call whose sub-agent the frame being read comes from.
    parent: Option<String>,
    /// The workspace's options, sent with every `turn/start` (`options`).
    overrides: options::TurnOverrides,
}

struct OpenTurn {
    id: String,
    /// Codex's id for it, once `turn/start` answers or `turn/started` arrives.
    codex: Option<String>,
    /// A `turn/start` is on its way.
    starting: bool,
    interrupting: bool,
    /// Codex refused a `turn/steer`: what's queued waits for the next turn.
    steer_refused: bool,
    /// Summed from each request's `last` usage.
    usage: Usage,
    /// An `error` notification already said why it failed.
    error_shown: bool,
}

struct Stream {
    row_id: String,
    role: Role,
    text: String,
    /// The reasoning summary part the text is on: a new part is a new paragraph.
    part: Option<u64>,
    /// The sub-agent's spawn call, for a sub-agent's text.
    parent: Option<String>,
}

impl Translator {
    /// `next_seq` continues the journal; `clock` gives Unix milliseconds (fixed
    /// in tests).
    pub fn new(
        next_seq: u64,
        clock: fn() -> u64,
        settings: ThreadSettings,
        resume: Option<String>,
    ) -> Self {
        Self {
            book: RowBook::new(next_seq, clock),
            info: SessionInfo {
                agent: "codex".to_string(),
                ..SessionInfo::default()
            },
            settings,
            resume,
            thread: None,
            next_id: 0,
            calls: HashMap::new(),
            queue: VecDeque::new(),
            turn: None,
            streams: HashMap::new(),
            started: HashMap::new(),
            pending: HashMap::new(),
            warned: HashSet::new(),
            spawns: HashMap::new(),
            threads: HashMap::new(),
            parent: None,
            overrides: options::TurnOverrides::default(),
        }
    }

    /// The first frame: `initialize`. The rest of the handshake follows its reply.
    pub fn start(&mut self) -> Vec<Out> {
        let params = json!({
            "clientInfo": {"name": "trace", "title": "trace", "version": env!("CARGO_PKG_VERSION")},
            // For `availableDecisions` on approvals: the options Codex offers.
            "capabilities": {"experimentalApi": true, "requestAttestation": false},
        });
        vec![self.request(Call::Initialize, "initialize", params)]
    }

    /// One line of Codex's stdout. Lines that aren't JSON are ignored.
    pub fn line(&mut self, line: &str) -> Vec<Out> {
        let mut out = Vec::new();
        let Ok(m) = serde_json::from_str::<Value>(line) else {
            return out;
        };
        let method = str_at(&m, "method");
        match (method, m.get("id")) {
            (Some(method), Some(id)) => self.server_request(method, id, &m["params"], &mut out),
            (Some(method), None) => self.notification(method, &m["params"], &mut out),
            (None, Some(id)) => self.response(id, &m, &mut out),
            (None, None) => {}
        }
        out
    }

    pub(super) fn notification(&mut self, method: &str, p: &Value, out: &mut Vec<Out>) {
        // A sub-agent's thread reports on the same connection: its rows go under
        // the call that spawned it (`agents`). Other threads' aren't ours.
        let theirs = str_at(p, "threadId");
        if self.parent.is_none()
            && theirs.is_some()
            && self.thread.is_some()
            && theirs != self.thread.as_deref()
        {
            if let Some(call) = theirs.and_then(|t| self.threads.get(t)).cloned() {
                self.child_notification(call, method, p, out);
            }
            return;
        }
        match method {
            "item/started" => self.item_started(&p["item"], out),
            "item/completed" => self.item_completed(&p["item"], out),
            "item/agentMessage/delta" => self.delta(p, Role::Assistant, None, out),
            "item/reasoning/summaryTextDelta" => {
                self.delta(p, Role::Reasoning, p["summaryIndex"].as_u64(), out)
            }
            "item/reasoning/textDelta" => self.delta(p, Role::Reasoning, None, out),
            "item/commandExecution/outputDelta" => self.output_delta(p),
            "turn/started" => self.turn_started(&p["turn"], out),
            "turn/completed" => self.turn_completed(&p["turn"], out),
            "turn/plan/updated" => self.plan(p, out),
            "thread/tokenUsage/updated" => self.token_usage(&p["tokenUsage"], out),
            "account/rateLimits/updated" => self.rate_limits(&p["rateLimits"], out),
            "serverRequest/resolved" => self.resolved(&p["requestId"], out),
            "error" => self.error(p, out),
            "warning" | "configWarning" | "deprecationNotice" => self.warning(p, out),
            "model/rerouted" => {
                if let Some(to) = str_at(p, "toModel") {
                    let model = to.to_string();
                    self.set_info(out, |i| i.model = Some(model));
                }
            }
            _ => {}
        }
    }

    fn response(&mut self, id: &Value, m: &Value, out: &mut Vec<Out>) {
        let Some(call) = id.as_u64().and_then(|id| self.calls.remove(&id)) else {
            return;
        };
        let result = &m["result"];
        let error = m.get("error").filter(|e| !e.is_null());
        match (call, error) {
            (Call::Initialize, None) => {
                out.push(Out::Send(json!({"method": "initialized"})));
                self.open_thread(out);
            }
            (Call::ThreadStart | Call::ThreadResume, None) => self.thread_opened(result, out),
            (Call::ThreadResume, Some(e)) if no_rollout(e) => {
                // Never saved (no turn ran): a fresh thread takes its place.
                self.resume = None;
                self.open_thread(out);
            }
            (Call::TurnStart, None) => self.turn_accepted(&result["turn"], out),
            (Call::TurnStart, Some(e)) => self.turn_refused(&error_text(e), out),
            (Call::Steer(input), Some(_)) => {
                // The turn is ending: the message starts the next one.
                if let Some(turn) = self.turn.as_mut() {
                    turn.steer_refused = true;
                }
                self.queue.push_front(input);
                self.pump(out);
            }
            (Call::Steer(_), None) => {}
            (Call::Interrupt, Some(e)) => self.status(&error_text(e), Tone::Warning, out),
            (Call::Interrupt, None) => {}
            (Call::Initialize | Call::ThreadStart | Call::ThreadResume, Some(e)) => {
                let text = format!("Codex couldn't start: {}", error_text(e));
                self.status(&text, Tone::Error, out);
                self.refuse_queue(out);
            }
        }
    }

    /// `thread/start`, or `thread/resume` for a saved thread.
    fn open_thread(&mut self, out: &mut Vec<Out>) {
        let mut params = self.settings.params();
        let (call, method) = match &self.resume {
            Some(id) => {
                params["threadId"] = json!(id);
                // The history is in the journal already; don't send it all back.
                params["excludeTurns"] = json!(true);
                (Call::ThreadResume, "thread/resume")
            }
            None => (Call::ThreadStart, "thread/start"),
        };
        out.push(self.request(call, method, params));
    }

    fn thread_opened(&mut self, result: &Value, out: &mut Vec<Out>) {
        let thread = str_at(&result["thread"], "id").map(str::to_string);
        let model = str_at(result, "model").map(str::to_string);
        self.thread = thread.clone();
        self.set_info(out, |i| {
            i.conversation_id = thread.or(i.conversation_id.take());
            i.model = model.or(i.model.take());
        });
        self.thread_settings(result, out);
        self.pump(out);
    }

    /// A JSON-RPC request of ours, remembered until its response.
    fn request(&mut self, call: Call, method: &str, params: Value) -> Out {
        let id = self.next_id;
        self.next_id += 1;
        self.calls.insert(id, call);
        Out::Send(json!({"method": method, "id": id, "params": params}))
    }
}

/// `thread/resume`'s refusal when Codex has no rollout file for the thread.
fn no_rollout(e: &Value) -> bool {
    str_at(e, "message").is_some_and(|m| m.contains("no rollout found"))
}

/// A JSON-RPC error's message, or Codex's turn error's. Codex passes API errors
/// through as JSON in the message; the API's own message is the readable part.
pub(super) fn error_text(e: &Value) -> String {
    let message = str_at(e, "message").unwrap_or("Codex reported an error.");
    serde_json::from_str::<Value>(message)
        .ok()
        .and_then(|inner| {
            str_at(&inner["error"], "message")
                .or_else(|| str_at(&inner, "message"))
                .map(str::to_string)
        })
        .unwrap_or_else(|| message.to_string())
}

pub(super) fn str_at<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
