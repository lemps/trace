//! Files the renderer keeps a whole copy of.

use std::sync::atomic::{AtomicBool, Ordering};

/// Guards a file the renderer loads whole and later saves back whole. If its load
/// fails it carries on with an empty copy, and once the read error clears, saving that
/// copy would pass every check in `update` and wipe the file. So saves are refused from
/// a failed load until a load succeeds.
#[derive(Default)]
pub struct LoadGate(AtomicBool);

impl LoadGate {
    pub const fn new() -> Self {
        Self(AtomicBool::new(false))
    }

    /// Note how a load for the renderer went, passing the result through.
    pub fn observe<T>(&self, load: Result<T, String>) -> Result<T, String> {
        self.0.store(load.is_err(), Ordering::Relaxed);
        load
    }

    /// Err if the renderer's last load failed, so what it holds isn't the file.
    pub fn check(&self) -> Result<(), String> {
        if self.0.load(Ordering::Relaxed) {
            return Err("Couldn't load the saved copy, so this wasn't saved over it.".to_string());
        }
        Ok(())
    }
}
