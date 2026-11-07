import { claimMemory, forgetUnclaimedMemory } from "@/domains/live/reloadMemory";
import { restoreLive } from "@/domains/live/sync";
import { agentRunning, liveWorkspaces } from "@/ipc/agent";
import { useBoardStore } from "./store";
import { restoreTurnMemory, watchForQuiet } from "./waitingNotify";

// Adopting a PTY the backend has but the renderer doesn't know about: after a page
// reload, or a run started before the webview was listening. Nobody just gave these
// agents work, so this isn't `setAgentRunning(id, true)`, which says somebody did: it
// would read "working" with nothing to end it (an idle TUI emits no output) and arm
// a notification for a turn the user never asked for.

/** Workspaces that stopped during each backend query in flight. */
const queries = new Set<Set<string>>();

/** A stop or exit: any answer still on its way predates it. */
export function noteAgentGone(id: string): void {
  for (const gone of queries) gone.add(id);
}

async function tracking<T>(query: Promise<T>): Promise<[T, Set<string>]> {
  const gone = new Set<string>();
  queries.add(gone);
  try {
    return [await query, gone];
  } finally {
    queries.delete(gone);
  }
}

/**
 * Take one live PTY into the running set, as it was before the reload if that's
 * remembered. If not it rests at Ready: it's alive at its prompt as far as anyone
 * knows, a reload isn't news, and an agent that is really at work flips to Working
 * on its next output. An agent already running is left alone, so a start that got
 * here first keeps its turn; one that lands later overwrites this with its own.
 */
function adopt(id: string): boolean {
  const board = useBoardStore.getState();
  if (board.runningAgents.has(id)) return false;
  const memory = claimMemory(id);
  // Output since the reload outranks what was remembered: the agent is talking now.
  const outputSeen = board.agentActivity[id] === "working";
  const activity = outputSeen ? "working" : (memory?.activity ?? "waiting");
  useBoardStore.setState((s) => ({
    runningAgents: new Set(s.runningAgents).add(id),
    agentActivity: { ...s.agentActivity, [id]: activity },
    ackedWaiting: memory && !memory.acked ? s.ackedWaiting : new Set(s.ackedWaiting).add(id),
  }));
  if (memory) {
    restoreTurnMemory(id, memory.turn);
    restoreLive(id, memory);
  }
  // Only output runs the quiet timers, and the reload dropped any that were pending.
  // A turn that ended in the gap gets no more output, so start them here.
  if (activity === "working" || memory?.turn.armed) watchForQuiet(id);
  return true;
}

/** Adopt everything the backend is running (PTYs and chat agents). Called once at
 * app start; returns the ids it found live. */
export async function adoptLiveAgents(): Promise<string[]> {
  const [ids, gone] = await tracking(liveWorkspaces());
  const live = ids.filter((id) => !gone.has(id));
  for (const id of live) adopt(id);
  forgetUnclaimedMemory();
  return live;
}

/** Adopt one workspace if it's alive; true when that changed anything. */
export async function adoptIfAlive(id: string): Promise<boolean> {
  const [alive, gone] = await tracking(agentRunning(id));
  return alive && !gone.has(id) && adopt(id);
}

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
