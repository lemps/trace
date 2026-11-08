//! How full Claude's context window is, for the chat header's gauge.
//!
//! Each main-thread `assistant` line's `message.usage` is one API call, so its
//! input (fresh + cache read + cache write) is what the context holds now. The
//! `result`'s own `usage` sums a turn's calls and would overstate it. The window
//! comes from the `result`'s `modelUsage.<model>.contextWindow`; until one
//! arrives it's guessed from the model id and marked as an estimate.

use serde_json::Value;

use super::{Out, Translator};
use crate::agent_session::claude::prompts::str_at;
use crate::agent_session::ContextUsage;

/// The window Claude Code reports for most models, when nothing says otherwise.
const DEFAULT_WINDOW: u64 = 200_000;
const MILLION: u64 = 1_000_000;

/// What the translator knows about the context between lines.
#[derive(Default)]
pub(super) struct ContextState {
    /// The main thread's model, from its latest `assistant` line.
    model: Option<String>,
    /// The window a `result` reported, and the model it's for.
    window: Option<(String, u64)>,
}

impl Translator {
    /// An `assistant` line: a subagent's (it has a parent call) never counts.
    pub(super) fn context_from_assistant(&mut self, m: &Value, out: &mut Vec<Out>) {
        if !m["parent_tool_use_id"].is_null() {
            return;
        }
        let msg = &m["message"];
        let Some(used) = call_tokens(&msg["usage"]) else {
            return;
        };
        if let Some(model) = str_at(msg, "model") {
            self.context.model = Some(model.to_string());
        }
        self.put_context(used, out);
    }

    /// A `result`: the window it reports for the main model replaces the guess.
    pub(super) fn context_from_result(&mut self, m: &Value, out: &mut Vec<Out>) {
        let model = self
            .context
            .model
            .clone()
            .or_else(|| self.info.model.clone());
        let Some((key, window)) = result_window(&m["modelUsage"], model.as_deref()) else {
            return;
        };
        self.context.window = Some((key, window));
        if let Some(used) = self.info.context.map(|c| c.used) {
            self.put_context(used, out);
        }
    }

    fn put_context(&mut self, used: u64, out: &mut Vec<Out>) {
        let model = self
            .context
            .model
            .clone()
            .or_else(|| self.info.model.clone());
        let known = self
            .context
            .window
            .as_ref()
            .filter(|(m, _)| model.as_deref().is_none_or(|model| same_model(m, model)))
            .map(|(_, w)| *w);
        let context = ContextUsage {
            used,
            window: known.unwrap_or_else(|| fallback_window(model.as_deref())),
            estimated: known.is_none(),
        };
        self.set_info(out, |i| i.context = Some(context));
    }
}

/// The tokens one API call sent: fresh input plus cache reads and writes.
/// `None` when the usage is missing (a synthetic message).
pub(super) fn call_tokens(usage: &Value) -> Option<u64> {
    let keys = [
        "input_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ];
    let parts: Vec<u64> = keys.iter().filter_map(|k| usage[*k].as_u64()).collect();
    (!parts.is_empty()).then(|| parts.iter().sum())
}

/// The context window `modelUsage` reports for `model`, with the key it's under.
/// A subagent on another model adds its own entry, so the main model's is
/// preferred; with no match, a lone entry is taken as the main model's.
pub(super) fn result_window(model_usage: &Value, model: Option<&str>) -> Option<(String, u64)> {
    let entries: Vec<(&String, u64)> = model_usage
        .as_object()?
        .iter()
        .filter_map(|(k, v)| Some((k, v["contextWindow"].as_u64().filter(|w| *w > 0)?)))
        .collect();
    let matched = model.and_then(|m| entries.iter().find(|(k, _)| same_model(k, m)));
    let (key, window) = match (matched, entries.as_slice()) {
        (Some(e), _) => *e,
        (None, [only]) => *only,
        _ => return None,
    };
    Some((key.clone(), window))
}

/// The window to assume before Claude says: a million for a `[1m]` model id or
/// a model known to have one, otherwise 200k.
pub(super) fn fallback_window(model: Option<&str>) -> u64 {
    let Some(model) = model.map(str::to_ascii_lowercase) else {
        return DEFAULT_WINDOW;
    };
    // Claude Code reports a 1M window for the Claude 5 family (the fixtures
    // record `claude-haiku-5-5` at 1,000,000).
    let five = ["opus", "sonnet", "haiku", "fable"]
        .iter()
        .any(|family| model.starts_with(&format!("claude-{family}-5")));
    if model.ends_with("[1m]") || five {
        MILLION
    } else {
        DEFAULT_WINDOW
    }
}

/// The same model, ignoring a `[1m]` suffix one side may carry.
fn same_model(a: &str, b: &str) -> bool {
    let bare = |s: &str| s.trim_end_matches("[1m]").to_ascii_lowercase();
    bare(a) == bare(b)
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::*;
    use crate::agent_session::SessionInfo;

    fn fixture(name: &str) -> String {
        let dir = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/agent_session/claude/fixtures"
        );
        std::fs::read_to_string(format!("{dir}/{name}")).unwrap_or_default()
    }

    /// Each context the translator reports while reading a fixture, as it changes
    /// (other info changes carry the same one along).
    fn contexts(name: &str) -> Vec<ContextUsage> {
        let mut t = Translator::new(0, || 0);
        let text = fixture(name);
        assert!(!text.is_empty(), "missing fixture {name}");
        text.lines()
            .flat_map(|l| t.line(l))
            .filter_map(|o| match o {
                Out::Info(SessionInfo { context, .. }) => context,
                _ => None,
            })
            .fold(Vec::new(), |mut seen, c| {
                if seen.last() != Some(&c) {
                    seen.push(c);
                }
                seen
            })
    }

    #[test]
    fn one_calls_tokens_are_its_input_and_cache() {
        let u = json!({"input_tokens": 2, "cache_read_input_tokens": 28881,
                       "cache_creation_input_tokens": 1896, "output_tokens": 146});
        assert_eq!(call_tokens(&u), Some(30779));
        assert_eq!(call_tokens(&Value::Null), None);
    }

    #[test]
    fn the_window_is_the_main_models() {
        let usage = json!({
            "claude-opus-5-5": {"contextWindow": 200000},
            "claude-haiku-5-5": {"contextWindow": 1000000},
        });
        let main = result_window(&usage, Some("claude-opus-5-5[1m]"));
        assert_eq!(main, Some(("claude-opus-5-5".to_string(), 200_000)));
        // Two models and no way to tell which is the main one: no answer.
        assert_eq!(result_window(&usage, None), None);
        let one = json!({"claude-haiku-5-5": {"contextWindow": 1000000}});
        assert_eq!(
            result_window(&one, Some("other")).map(|w| w.1),
            Some(MILLION)
        );
    }

    #[test]
    fn the_guess_is_a_million_for_1m_models() {
        assert_eq!(fallback_window(Some("claude-opus-5-5[1m]")), MILLION);
        assert_eq!(fallback_window(Some("deepseek-v4-pro[1M]")), MILLION);
        assert_eq!(fallback_window(Some("claude-sonnet-5-5")), MILLION);
        assert_eq!(fallback_window(Some("claude-sonnet-4-5")), DEFAULT_WINDOW);
        assert_eq!(fallback_window(Some("kimi-k3")), DEFAULT_WINDOW);
        assert_eq!(fallback_window(None), DEFAULT_WINDOW);
    }

    #[test]
    fn the_gauge_follows_the_latest_call_and_learns_the_window() {
        let seen = contexts("deny.jsonl");
        let first = seen.first().copied();
        // The first call: an estimate until the result reports the window.
        assert_eq!(
            first,
            Some(ContextUsage {
                used: 2 + 18377 + 10504,
                window: MILLION,
                estimated: true
            })
        );
        let last = seen.last().copied();
        assert_eq!(
            last,
            Some(ContextUsage {
                used: 2 + 28881 + 1896,
                window: MILLION,
                estimated: false
            })
        );
        // One message's blocks repeat its usage: that's one change, not three.
        assert_eq!(seen.len(), 3);
    }

    #[test]
    fn subagents_never_move_the_main_gauge() {
        // The subagent's calls (19603 cache writes, 0 reads) never show.
        for name in [
            "subagents.jsonl",
            "background_subagent.jsonl",
            "subagent_interrupt.jsonl",
        ] {
            for c in contexts(name) {
                assert!(c.used > 25_000, "{name}: a subagent's {} showed", c.used);
            }
        }
        let last = contexts("subagents.jsonl").last().copied();
        assert_eq!(last.map(|c| c.used), Some(2 + 27245 + 2917));
    }
}
