//! How long a sandbox runs on its own (Settings → Integrations → Vercel): how
//! long it waits idle before stopping (and saving), and the longest one run
//! lasts. Read by the keep-alive each time a session starts (`helpers`). Kept
//! in a user-only file, like everything under the app config dir.

use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::helpers::persist::{self, Style};

/// Idle this long with nothing to do, a sandbox stops: long enough to read an
/// answer and type the next prompt, short enough not to pay for an empty one.
pub const DEFAULT_IDLE_MINUTES: u32 = 10;
/// The longest one run lasts, working or not: a long task, not an overnight leak.
pub const DEFAULT_MAX_HOURS: u32 = 6;
const IDLE_RANGE: (u32, u32) = (1, 120);
/// Vercel's own ceiling for a session is 24 hours (Pro and Enterprise).
const MAX_RANGE: (u32, u32) = (1, 24);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Lifetime {
    pub idle_minutes: u32,
    pub max_hours: u32,
}

impl Default for Lifetime {
    fn default() -> Self {
        Lifetime {
            idle_minutes: DEFAULT_IDLE_MINUTES,
            max_hours: DEFAULT_MAX_HOURS,
        }
    }
}

impl Lifetime {
    /// Within what makes sense (and what Vercel allows).
    pub fn clamped(self) -> Lifetime {
        Lifetime {
            idle_minutes: self.idle_minutes.clamp(IDLE_RANGE.0, IDLE_RANGE.1),
            max_hours: self.max_hours.clamp(MAX_RANGE.0, MAX_RANGE.1),
        }
    }

    pub fn idle(self) -> Duration {
        Duration::from_secs(u64::from(self.idle_minutes) * 60)
    }

    pub fn max_run(self) -> Duration {
        Duration::from_secs(u64::from(self.max_hours) * 60 * 60)
    }
}

fn path() -> PathBuf {
    crate::helpers::trace_dir().join("sandbox-lifetime.json")
}

/// The saved settings, or the defaults.
pub fn load() -> Lifetime {
    persist::read_or_log::<Option<Lifetime>>(&path())
        .unwrap_or_default()
        .clamped()
}

pub fn save(lifetime: Lifetime) -> Result<Lifetime, String> {
    let lifetime = lifetime.clamped();
    persist::write_json(&path(), Style::Compact, &lifetime)?;
    Ok(lifetime)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_stay_within_what_vercel_allows() {
        let wild = Lifetime {
            idle_minutes: 0,
            max_hours: 48,
        };
        assert_eq!(
            wild.clamped(),
            Lifetime {
                idle_minutes: 1,
                max_hours: 24
            }
        );
        assert_eq!(Lifetime::default().idle(), Duration::from_secs(600));
    }

    #[test]
    fn reaches_the_renderer_in_camel_case() {
        let json = serde_json::to_value(Lifetime::default()).unwrap_or_default();
        assert_eq!(json["idleMinutes"], 10);
        assert_eq!(json["maxHours"], 6);
    }
}
