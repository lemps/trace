// Asks an agent's tool call parks until the user answers them in trace (the
// repo tools' confirm card). The call waits a while; if the user hasn't
// answered by then it returns "ask again later", and the ask stays up. An
// approval runs the action at once, whether or not a call is still waiting; the
// outcome is kept for the agent's next identical ask. Pure (timers injected),
// so `npm test` can load it.

/** What the user is asked. */
export interface Ask {
  id: string;
  kind: "add" | "clone";
  /** The repo: a folder path (add) or `owner/name` (clone). */
  target: string;
  /** Where it will live, when that's not `target` (a clone's folder). */
  detail: string;
  /** The calling agent's workspace id, and how it reads ("Fix login", "ENG-12"). */
  caller: string;
  callerLabel: string;
  at: number;
}

export type Outcome =
  | { kind: "done"; text: string }
  | { kind: "failed"; text: string }
  | { kind: "denied" };

interface Entry {
  ask: Ask;
  run: () => Promise<string>;
  running: boolean;
  outcome?: Outcome;
  waiters: Set<(o: Outcome) => void>;
}

export interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const REAL_TIMERS: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** One agent can't stack up more open asks than this. */
export const MAX_OPEN_PER_CALLER = 3;

export class ConfirmQueue {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private shown: Ask[] = [];
  private timers: Timers;
  private now: () => number;

  constructor(timers: Timers = REAL_TIMERS, now: () => number = Date.now) {
    this.timers = timers;
    this.now = now;
  }

  /** The asks waiting for the user, oldest first (a stable array between changes). */
  open(): Ask[] {
    return this.shown;
  }

  /** Whether an approved ask is still running. */
  isRunning(id: string): boolean {
    return [...this.entries.values()].some((e) => e.ask.id === id && e.running);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.shown = [...this.entries.values()]
      .filter((e) => !e.outcome)
      .map((e) => e.ask)
      .sort((a, b) => a.at - b.at);
    for (const fn of this.listeners) fn();
  }

  /**
   * Ask the user (or re-join the same ask), and wait up to `waitMs` for the
   * answer. `run` is what an approval does. "timeout" leaves the ask up.
   */
  request(
    ask: Omit<Ask, "id" | "at">,
    run: () => Promise<string>,
    waitMs: number
  ): Promise<Outcome | "timeout"> {
    const key = `${ask.caller}\n${ask.kind}\n${ask.target}`;
    let entry = this.entries.get(key);
    if (entry?.outcome) {
      this.entries.delete(key);
      this.changed();
      return Promise.resolve(entry.outcome);
    }
    if (!entry) {
      const mine = [...this.entries.values()].filter(
        (e) => e.ask.caller === ask.caller && !e.outcome
      );
      if (mine.length >= MAX_OPEN_PER_CALLER) {
        return Promise.resolve({
          kind: "failed",
          text: `You already have ${mine.length} requests waiting for the user. Wait for those first.`,
        });
      }
      this.seq += 1;
      entry = {
        ask: { ...ask, id: `ask-${this.seq}`, at: this.now() },
        run,
        running: false,
        waiters: new Set(),
      };
      this.entries.set(key, entry);
      this.changed();
    }
    const live = entry;
    return new Promise((resolve) => {
      const waiter = (o: Outcome) => {
        this.timers.clear(timer);
        resolve(o);
      };
      const timer = this.timers.set(() => {
        live.waiters.delete(waiter);
        resolve("timeout");
      }, waitMs);
      live.waiters.add(waiter);
    });
  }

  /** The user's answer to ask `id`. Approving runs its action. */
  async answer(id: string, approve: boolean): Promise<void> {
    const found = [...this.entries.entries()].find(([, e]) => e.ask.id === id);
    if (!found) return;
    const [key, entry] = found;
    if (entry.outcome || entry.running) return;
    let outcome: Outcome = { kind: "denied" };
    if (approve) {
      entry.running = true;
      this.changed();
      try {
        outcome = { kind: "done", text: await entry.run() };
      } catch (e) {
        outcome = { kind: "failed", text: e instanceof Error ? e.message : String(e) };
      }
      entry.running = false;
    }
    entry.outcome = outcome;
    if (entry.waiters.size > 0) {
      // A call is waiting: it takes the outcome, and nothing is kept.
      for (const w of entry.waiters) w(outcome);
      entry.waiters.clear();
      this.entries.delete(key);
    }
    this.changed();
  }
}
