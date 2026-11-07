//! Which chat agents exist, per workspace, through their whole life: starting
//! (a worktree is being made, the process launched), running, and stopping
//! (asked to end, its process not gone yet). A workspace in any of these has a
//! process or will soon, so it can't get a second one, chat or terminal: two
//! processes on one conversation id would fork it.
//!
//! One mutex, and nothing is called while it's held except an adapter method,
//! which only queues a message for the adapter's own thread. That thread
//! reaches the registry (its process ending) holding nothing.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::Mutex;

use super::{AgentAdapter, SessionInfo};

/// Chat agents by workspace id. Lives in `AppState`.
#[derive(Default)]
pub struct ChatAgents {
    slots: Mutex<HashMap<String, Slot>>,
    next_instance: AtomicU64,
    /// The last `SessionInfo` each workspace's agent reported, kept after it
    /// exits (not busy then), so a view mounted later knows what it was.
    infos: Mutex<HashMap<String, SessionInfo>>,
}

enum Slot {
    Starting {
        instance: u64,
        /// Stop was asked for before the process was up.
        cancelled: bool,
        /// The process already ended, before it was registered.
        ended: bool,
    },
    Running {
        instance: u64,
        adapter: Box<dyn AgentAdapter>,
    },
    Stopping {
        instance: u64,
    },
}

/// What [`ChatAgents::begin`] found.
pub enum Begin {
    /// Go ahead, as this instance.
    Start(u64),
    /// One is already starting or running.
    Already,
}

impl ChatAgents {
    /// Whether the workspace has a chat agent in any state, so another process
    /// for it (a terminal agent, a second chat) must not start.
    pub fn is_running(&self, workspace_id: &str) -> bool {
        self.slots.lock().contains_key(workspace_id)
    }

    /// Claim the workspace for a new agent.
    pub fn begin(&self, workspace_id: &str) -> Result<Begin, String> {
        let mut slots = self.slots.lock();
        match slots.get(workspace_id) {
            Some(Slot::Stopping { .. }) => {
                Err("This agent is still stopping. Try again in a moment.".to_string())
            }
            Some(_) => Ok(Begin::Already),
            None => {
                let instance = self.next_instance.fetch_add(1, Ordering::Relaxed);
                let slot = Slot::Starting {
                    instance,
                    cancelled: false,
                    ended: false,
                };
                slots.insert(workspace_id.to_string(), slot);
                Ok(Begin::Start(instance))
            }
        }
    }

    /// The start failed before a process ran: release the workspace.
    pub fn abandon(&self, workspace_id: &str, instance: u64) {
        let mut slots = self.slots.lock();
        if matches!(slots.get(workspace_id), Some(Slot::Starting { instance: i, .. }) if *i == instance)
        {
            slots.remove(workspace_id);
        }
    }

    /// The process is up. It runs, or, when stop came first, is stopped now.
    /// False when its process had already ended.
    pub fn register(
        &self,
        workspace_id: &str,
        instance: u64,
        mut adapter: Box<dyn AgentAdapter>,
    ) -> bool {
        let mut slots = self.slots.lock();
        let (cancelled, ended) = match slots.get(workspace_id) {
            Some(Slot::Starting {
                instance: i,
                cancelled,
                ended,
            }) if *i == instance => (*cancelled, *ended),
            _ => {
                adapter.stop();
                return false;
            }
        };
        let next = match (ended, cancelled) {
            (true, _) => None,
            (false, true) => {
                adapter.stop();
                Some(Slot::Stopping { instance })
            }
            (false, false) => Some(Slot::Running { instance, adapter }),
        };
        match next {
            Some(slot) => slots.insert(workspace_id.to_string(), slot),
            None => slots.remove(workspace_id),
        };
        !ended
    }

    /// Run `f` on a running workspace's adapter.
    pub fn with<R>(
        &self,
        workspace_id: &str,
        f: impl FnOnce(&mut dyn AgentAdapter) -> Result<R, String>,
    ) -> Result<R, String> {
        let mut slots = self.slots.lock();
        match slots.get_mut(workspace_id) {
            Some(Slot::Running { adapter, .. }) => f(adapter.as_mut()),
            _ => Err("This agent isn't running.".to_string()),
        }
    }

    /// Ask the workspace's agent to end. It stays listed (stopping) until its
    /// process is gone; one still starting is stopped as soon as it's up.
    pub fn stop(&self, workspace_id: &str) {
        let mut slots = self.slots.lock();
        let Some(slot) = slots.get_mut(workspace_id) else {
            return;
        };
        match slot {
            Slot::Starting { cancelled, .. } => *cancelled = true,
            Slot::Running { instance, adapter } => {
                adapter.stop();
                *slot = Slot::Stopping {
                    instance: *instance,
                };
            }
            Slot::Stopping { .. } => {}
        }
    }

    /// An instance's process ended: forget it, unless a newer one took its place.
    /// True when it was the workspace's agent (so the workspace is free now).
    pub fn ended(&self, workspace_id: &str, instance: u64) -> bool {
        let mut slots = self.slots.lock();
        let current = match slots.get_mut(workspace_id) {
            Some(Slot::Starting {
                instance: i, ended, ..
            }) if *i == instance => {
                *ended = true;
                true
            }
            Some(Slot::Running { instance: i, .. } | Slot::Stopping { instance: i })
                if *i == instance =>
            {
                slots.remove(workspace_id);
                true
            }
            _ => false,
        };
        drop(slots);
        if current {
            if let Some(info) = self.infos.lock().get_mut(workspace_id) {
                info.busy = false;
            }
        }
        current
    }

    /// The agent reported its session info. What it doesn't say yet (the model
    /// before Claude's `init`) is kept from before. Returns what's stored now.
    pub fn note_info(&self, workspace_id: &str, mut info: SessionInfo) -> SessionInfo {
        let mut infos = self.infos.lock();
        if let Some(prev) = infos.get(workspace_id) {
            if info.model.is_none() {
                info.model = prev.model.clone();
            }
            if info.conversation_id.is_none() {
                info.conversation_id = prev.conversation_id.clone();
            }
            if info.slash_commands.is_empty() {
                info.slash_commands = prev.slash_commands.clone();
            }
            if info.limits.is_empty() {
                info.limits = prev.limits.clone();
            }
        }
        infos.insert(workspace_id.to_string(), info.clone());
        info
    }

    /// The workspace's last reported session info, if a chat agent ran this launch.
    pub fn info(&self, workspace_id: &str) -> Option<SessionInfo> {
        self.infos.lock().get(workspace_id).cloned()
    }

    /// Every workspace with a chat agent in any state, for the renderer to adopt.
    pub fn workspaces(&self) -> Vec<String> {
        self.slots.lock().keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_session::journal::Answer;
    use crate::agent_session::UserMessage;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    struct Fake(Arc<AtomicBool>);

    impl AgentAdapter for Fake {
        fn send(&mut self, _: UserMessage) -> Result<(), String> {
            Ok(())
        }
        fn answer(&mut self, _: &str, _: Answer) -> Result<(), String> {
            Ok(())
        }
        fn interrupt(&mut self) -> Result<(), String> {
            Ok(())
        }
        fn stop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    fn start(agents: &ChatAgents) -> u64 {
        match agents.begin("ws").unwrap() {
            Begin::Start(i) => i,
            Begin::Already => panic!("already"),
        }
    }

    #[test]
    fn stopping_holds_the_workspace_until_the_process_ends() {
        let agents = ChatAgents::default();
        let stopped = Arc::new(AtomicBool::new(false));
        let i = start(&agents);
        assert!(matches!(agents.begin("ws"), Ok(Begin::Already)));
        agents.register("ws", i, Box::new(Fake(stopped.clone())));
        agents.stop("ws");
        assert!(stopped.load(Ordering::SeqCst));
        assert!(agents.is_running("ws"));
        assert!(agents.begin("ws").is_err());
        agents.ended("ws", i);
        assert!(!agents.is_running("ws"));
        start(&agents);
    }

    #[test]
    fn a_stop_during_the_start_stops_the_agent_once_its_up() {
        let agents = ChatAgents::default();
        let stopped = Arc::new(AtomicBool::new(false));
        let i = start(&agents);
        agents.stop("ws");
        agents.register("ws", i, Box::new(Fake(stopped.clone())));
        assert!(stopped.load(Ordering::SeqCst));
        assert!(agents.with("ws", |_| Ok(())).is_err());
        agents.ended("ws", i);
        assert!(!agents.is_running("ws"));
    }

    #[test]
    fn an_early_exit_or_a_failed_start_frees_the_workspace() {
        let agents = ChatAgents::default();
        let i = start(&agents);
        agents.ended("ws", i);
        agents.register("ws", i, Box::new(Fake(Arc::default())));
        assert!(!agents.is_running("ws"));
        let j = start(&agents);
        agents.abandon("ws", j);
        assert!(!agents.is_running("ws"));
    }
}
