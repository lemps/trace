import { useBoardStore } from "@/domains/board/store";
import { type TurnMemory, turnMemory } from "@/domains/board/waitingNotify";
import { useLiveStore } from "./store";
import type { Ask } from "./types";

// What the renderer alone knows about its running agents, carried across a page
// reload. A reload empties the stores while the backend's PTYs live on, and most of
// this can't be read back: a hook's ask says exactly what a dialog wants, and only
// the renderer sees it answered. sessionStorage lasts as long as the webview, so as
// long as the PTYs: a quit takes both, and a killed webview writes nothing here,
// which leaves an adopted agent at its resting state (`board/adopt`).

const KEY = "trace.agentMemory";

/** One agent as it stood when the page went away. */
export interface AgentMemory {
  activity: "working" | "waiting";
  acked: boolean;
  ask: Ask | null;
  lastMessage: string | null;
  update: string | null;
  since: number;
  turn: TurnMemory;
}

function isMemory(value: unknown): value is AgentMemory {
  const m = value as Partial<AgentMemory> | null;
  return (
    (m?.activity === "working" || m?.activity === "waiting") &&
    typeof m.acked === "boolean" &&
    typeof m.since === "number" &&
    typeof m.turn === "object" &&
    m.turn !== null &&
    (m.ask === null || Array.isArray(m.ask?.options))
  );
}

/** Read once and removed: left in place, a later crash would replay it stale. */
function load(): Record<string, AgentMemory> {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, m]) => isMemory(m)));
  } catch {
    return {};
  }
}

let unclaimed = load();

/** An adopted agent takes what was remembered about it, if anything. */
export function claimMemory(id: string): AgentMemory | null {
  const memory = unclaimed[id] ?? null;
  delete unclaimed[id];
  return memory;
}

/** The backend has said what's alive, so whatever is left belongs to agents that aren't. */
export function forgetUnclaimedMemory(): void {
  unclaimed = {};
}

function save() {
  const { runningAgents, agentActivity, ackedWaiting } = useBoardStore.getState();
  const { info } = useLiveStore.getState();
  // Reloads come in bursts while editing: one before adoption finished still has
  // agents to remember, and they aren't in the stores yet.
  const memory: Record<string, AgentMemory> = { ...unclaimed };
  for (const id of runningAgents) {
    const live = info[id];
    if (!live) continue; // A shell has no light, so nothing worth keeping.
    memory[id] = {
      activity: agentActivity[id] ?? "working",
      acked: ackedWaiting.has(id),
      ask: live.ask,
      lastMessage: live.lastMessage,
      update: live.update,
      since: live.since,
      turn: turnMemory(id),
    };
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Best-effort: without it the agents come back at their resting state.
  }
}

window.addEventListener("pagehide", save);

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
