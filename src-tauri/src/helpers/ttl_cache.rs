//! A small in-memory cache whose entries expire: for tracker metadata that rarely
//! changes (a board's settings, a site's statuses, Pylon's users) and is fetched
//! on every board load. Never for issues: the tracker stays their source of truth.

use std::sync::Mutex;
use std::time::{Duration, Instant};

pub struct TtlCache<V> {
    ttl: Duration,
    /// Few keys (a board or a site each), so a list is enough.
    entries: Mutex<Vec<(String, Instant, V)>>,
}

impl<V: Clone> TtlCache<V> {
    pub const fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            entries: Mutex::new(Vec::new()),
        }
    }

    /// The value for `key`, if it was put less than the ttl ago.
    pub fn get(&self, key: &str) -> Option<V> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries
            .iter()
            .find(|(k, at, _)| k == key && at.elapsed() < self.ttl)
            .map(|(_, _, v)| v.clone())
    }

    /// Remember `value` for `key` from now, dropping anything expired.
    pub fn put(&self, key: String, value: V) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.retain(|(k, at, _)| *k != key && at.elapsed() < self.ttl);
        entries.push((key, Instant::now(), value));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_value_is_kept_until_it_expires() {
        let cache = TtlCache::new(Duration::from_millis(40));
        cache.put("board".into(), 7);
        assert_eq!(cache.get("board"), Some(7));
        assert_eq!(cache.get("other"), None);
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(cache.get("board"), None);
    }

    #[test]
    fn putting_again_replaces_the_value() {
        let cache = TtlCache::new(Duration::from_secs(60));
        cache.put("board".into(), 1);
        cache.put("board".into(), 2);
        assert_eq!(cache.get("board"), Some(2));
    }
}
