//! What Codex says beside the conversation: usage-limit windows, token counts,
//! warnings and errors, and trace's own notices, as `SessionInfo` and status rows.

use serde_json::Value;

use super::{error_text, str_at, Out, Translator};
use crate::agent_session::journal::{JournalBody, Status, Tone};
use crate::agent_session::{ContextUsage, LimitWindow, SessionInfo};

impl Translator {
    /// `account/rateLimits/updated`: the primary and secondary windows, named by
    /// length as Claude's are ("five_hour", "seven_day"). A sparse update leaves
    /// a window it doesn't mention as it was.
    pub(super) fn rate_limits(&mut self, snapshot: &Value, out: &mut Vec<Out>) {
        let windows: Vec<LimitWindow> = ["primary", "secondary"]
            .iter()
            .filter_map(|key| {
                let w = snapshot.get(*key).filter(|w| w.is_object())?;
                Some(LimitWindow {
                    name: window_name(w["windowDurationMins"].as_u64(), key),
                    utilization: (w["usedPercent"].as_f64()? / 100.0).clamp(0.0, 1.0),
                    resets_at: w["resetsAt"].as_u64(),
                })
            })
            .collect();
        if windows.is_empty() {
            return;
        }
        self.set_info(out, |info| {
            for w in windows {
                match info.limits.iter_mut().find(|l| l.name == w.name) {
                    Some(l) => *l = w,
                    None => info.limits.push(w),
                }
            }
        });
    }

    /// `thread/tokenUsage/updated`: `last` is one model request's usage, so the
    /// open turn's usage is their sum. (`total` is the thread's, resumed history
    /// included.) `last` against `modelContextWindow` is how full the context is.
    pub(super) fn token_usage(&mut self, usage: &Value, out: &mut Vec<Out>) {
        if let Some(context) = context_usage(usage) {
            self.set_info(out, |i| i.context = Some(context));
        }
        let Some(turn) = self.turn.as_mut() else {
            return;
        };
        let last = &usage["last"];
        let n = |k: &str| last[k].as_u64().unwrap_or(0);
        let cached = n("cachedInputTokens");
        // Codex counts cached input inside `inputTokens`; the journal keeps them apart.
        turn.usage.input_tokens += n("inputTokens").saturating_sub(cached);
        turn.usage.cache_read_tokens += cached;
        turn.usage.cache_write_tokens += n("cacheWriteInputTokens");
        turn.usage.output_tokens += n("outputTokens");
    }

    /// `error`: one Codex will retry is a warning; one it won't fails the turn,
    /// which `turn/completed` then reports without saying it again.
    pub(super) fn error(&mut self, p: &Value, out: &mut Vec<Out>) {
        let text = error_text(&p["error"]);
        if p["willRetry"].as_bool().unwrap_or(false) {
            let text = format!("{text} Retrying.");
            self.status(&text, Tone::Warning, out);
            return;
        }
        if let Some(turn) = self.turn.as_mut() {
            turn.error_shown = true;
        }
        self.status(&text, Tone::Error, out);
    }

    /// `warning`, `configWarning`, `deprecationNotice`: each text once.
    pub(super) fn warning(&mut self, p: &Value, out: &mut Vec<Out>) {
        let Some(text) = str_at(p, "message").or_else(|| str_at(p, "summary")) else {
            return;
        };
        let text = match str_at(p, "details") {
            Some(details) if !details.is_empty() => format!("{text}\n{details}"),
            _ => text.to_string(),
        };
        if self.warned.insert(text.clone()) {
            self.status(&text, Tone::Warning, out);
        }
    }

    /// A status row of trace's own (a prompt that couldn't be answered).
    pub fn notice(&mut self, text: &str, tone: Tone) -> Vec<Out> {
        let mut out = Vec::new();
        self.status(text, tone, &mut out);
        out
    }

    pub(super) fn status(&mut self, text: &str, tone: Tone, out: &mut Vec<Out>) {
        let id = format!("status:{}", self.book.next_seq());
        let turn = self.turn.as_ref().map(|t| t.id.clone());
        let body = JournalBody::Status(Status {
            text: crate::agent_session::journal::cap(text),
            tone,
        });
        out.push(Out::Row(self.book.put(&id, turn.as_deref(), body)));
        self.book.retire(&id);
    }

    /// Apply a change to the session info, sending it on only if it changed.
    pub(super) fn set_info(&mut self, out: &mut Vec<Out>, f: impl FnOnce(&mut SessionInfo)) {
        let before = self.info.clone();
        f(&mut self.info);
        if self.info != before {
            out.push(Out::Info(self.info.clone()));
        }
    }
}

/// The context gauge from a token-usage update: the latest request's tokens
/// (input, cached included, plus output, which the next request reads back)
/// against the model's window. `None` when Codex doesn't give the window.
fn context_usage(usage: &Value) -> Option<ContextUsage> {
    let window = usage["modelContextWindow"].as_u64().filter(|w| *w > 0)?;
    let used = usage["last"]["totalTokens"].as_u64()?;
    Some(ContextUsage {
        used,
        window,
        estimated: false,
    })
}

/// A window's name from its length, or its slot when Codex doesn't say.
fn window_name(minutes: Option<u64>, slot: &str) -> String {
    match minutes {
        Some(300) => "five_hour".to_string(),
        Some(1440) => "one_day".to_string(),
        Some(10080) => "seven_day".to_string(),
        Some(m) if m % 1440 == 0 => format!("{}_day", m / 1440),
        Some(m) if m % 60 == 0 => format!("{}_hour", m / 60),
        Some(m) => format!("{m}_minute"),
        None => slot.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{context_usage, window_name};
    use crate::agent_session::ContextUsage;

    #[test]
    fn windows_are_named_by_length() {
        assert_eq!(window_name(Some(300), "primary"), "five_hour");
        assert_eq!(window_name(Some(10080), "secondary"), "seven_day");
        assert_eq!(window_name(Some(120), "primary"), "2_hour");
        assert_eq!(window_name(None, "secondary"), "secondary");
    }

    #[test]
    fn the_context_is_the_latest_requests_tokens_against_the_window() {
        let usage = json!({
            "total": {"totalTokens": 27873},
            "last": {"totalTokens": 13978, "inputTokens": 13919, "outputTokens": 59},
            "modelContextWindow": 258400,
        });
        let context = ContextUsage {
            used: 13978,
            window: 258400,
            estimated: false,
        };
        assert_eq!(context_usage(&usage), Some(context));
        // No window, no gauge.
        let bare = json!({"last": {"totalTokens": 10}});
        assert_eq!(context_usage(&bare), None);
    }
}
