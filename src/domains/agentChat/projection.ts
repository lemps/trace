import {
  finishThread,
  isLauncher,
  newThread,
  parentIds,
  type SubagentThread,
} from "./subagents.ts";
import type {
  Approval,
  FileDiff,
  JournalRow,
  Message,
  Plan,
  QuestionSet,
  Status,
  ToolCall,
  Turn,
  TurnState,
} from "./types.ts";

// The journal arranged for reading: rows grouped into turns, each tool call
// carrying its approval and its file changes, each subagent's rows gathered on
// the call that started it (`subagents.ts`) instead of in the timeline, and a
// finished turn's work folded behind its final answer. Pure, so it re-runs on
// every new revision; each item, subagent and turn carries a `version` that
// only grows, so components can skip re-rendering what didn't change.

interface Base {
  row: JournalRow;
  /** Grows whenever this item, or anything attached to it, changes. */
  version: number;
}

export interface ToolItem extends Base {
  type: "tool";
  call: ToolCall;
  /** The permission request for this call, if it needed one. */
  approval: { row: JournalRow; approval: Approval } | null;
  /** File changes this call made. */
  diffs: { row: JournalRow; diff: FileDiff }[];
  /** Set when this call started a subagent: that agent's conversation. */
  subagent: SubagentThread | null;
}

export type ChatItem =
  | (Base & { type: "message"; message: Message })
  | ToolItem
  | (Base & { type: "diff"; diff: FileDiff })
  | (Base & { type: "plan"; plan: Plan })
  | (Base & { type: "approval"; approval: Approval })
  | (Base & { type: "question"; questions: QuestionSet })
  | (Base & { type: "status"; status: Status });

export type MessageItem = Extract<ChatItem, { type: "message" }>;

export interface ChatTurn {
  /** The journal's turn id, or a stand-in for rows that came without one. */
  id: string;
  /** The user's message(s) that opened it. */
  prompts: MessageItem[];
  items: ChatItem[];
  /** `open` until a `turn` row says otherwise. */
  state: TurnState | "open";
  summary: Turn | null;
  /** When the turn's first row arrived (unix ms). */
  startedAt: number;
  /** A finished turn's work, folded behind its answer; empty when nothing folds. */
  folded: ChatItem[];
  /** What's shown while folded: everything else, in order. */
  shown: ChatItem[];
  version: number;
}

export interface Chat {
  turns: ChatTurn[];
  /** Every subagent, in the order they started (nested ones too). */
  subagents: SubagentThread[];
}

type Owner = { turn: ChatTurn } | { thread: SubagentThread };

const rev = (row: JournalRow) => row.revision + 1;

/** Arrange rows (sorted by `seq`) into turns and subagents. */
export function buildChat(rows: readonly JournalRow[]): Chat {
  const parents = parentIds(rows);
  const tools = new Map<string, ToolItem>();
  const threads = new Map<string, SubagentThread>();
  const subagents: SubagentThread[] = [];
  /** Where each item is drawn: a turn, or a subagent's thread (and so its card). */
  const ownerOf = new Map<ChatItem, Owner>();
  /** A change to `item` re-renders it, the cards it's inside, and their turn. */
  const bumpItem = (item: ChatItem, by: number) => {
    item.version += by;
    bumpOwner(ownerOf.get(item), by);
  };
  const bumpOwner = (owner: Owner | undefined, by: number) => {
    if (!owner) return;
    if ("turn" in owner) owner.turn.version += by;
    else {
      owner.thread.version += by;
      bumpItem(owner.thread.call, by);
    }
  };
  const turns: ChatTurn[] = [];
  const byId = new Map<string, ChatTurn>();
  const bound = new Set<ChatTurn>();

  const create = (id: string, at: number): ChatTurn => {
    const turn: ChatTurn = {
      id,
      prompts: [],
      items: [],
      state: "open",
      summary: null,
      startedAt: at,
      folded: [],
      shown: [],
      version: 0,
    };
    turns.push(turn);
    byId.set(id, turn);
    return turn;
  };
  const last = () => turns[turns.length - 1] as ChatTurn | undefined;
  /** The turn a row naming `turnId` belongs to: known, or the prompt still waiting for its id. */
  const named = (turnId: string, at: number): ChatTurn => {
    const known = byId.get(turnId);
    if (known) return known;
    const waiting = last();
    if (waiting && !bound.has(waiting) && waiting.prompts.length > 0) {
      bound.add(waiting);
      byId.set(turnId, waiting);
      return waiting;
    }
    const turn = create(turnId, at);
    bound.add(turn);
    return turn;
  };

  // Approvals and diffs attach to their tool call when it's in the journal.
  const callIds = new Set<string>();
  for (const row of rows) if (row.body.kind === "tool") callIds.add(row.body.callId);
  const attached: JournalRow[] = [];

  for (const row of rows) {
    const { body } = row;
    if (body.kind === "turn") {
      const turn = named(body.turnId || row.turnId || row.id, row.at);
      turn.summary = body;
      turn.state = body.state;
      turn.version += rev(row);
      continue;
    }
    if (
      (body.kind === "approval" || body.kind === "diff") &&
      body.callId &&
      callIds.has(body.callId)
    ) {
      attached.push(row);
      continue;
    }
    const item = toItem(row);
    if (item.type === "tool") {
      tools.set(item.call.callId, item);
      if (isLauncher(row, parents)) {
        const thread = newThread(item);
        item.subagent = thread;
        threads.set(item.call.callId, thread);
        subagents.push(thread);
      }
    }
    // A subagent's own row is drawn in its thread, wherever its card is (an
    // earlier turn, for a background agent), never in the timeline.
    const parent = body.kind === "tool" || body.kind === "message" ? body.parentCallId : undefined;
    const thread = parent ? threads.get(parent) : undefined;
    if (thread) {
      thread.items.push(item);
      ownerOf.set(item, { thread });
      bumpOwner({ thread }, item.version);
      continue;
    }
    const isPrompt = body.kind === "message" && body.role === "user";
    let turn: ChatTurn;
    if (row.turnId) turn = named(row.turnId, row.at);
    else {
      const current = last();
      const fresh =
        current && !bound.has(current) && current.items.length === 0 && !current.summary;
      turn = isPrompt
        ? fresh && current
          ? current
          : create(`row:${row.id}`, row.at)
        : (current ?? create(`row:${row.id}`, row.at));
    }
    ownerOf.set(item, { turn });
    turn.version += rev(row);
    if (item.type === "message" && isPrompt && turn.items.length === 0) turn.prompts.push(item);
    else turn.items.push(item);
  }

  for (const row of attached) {
    const { body } = row;
    const callId = body.kind === "approval" || body.kind === "diff" ? body.callId : undefined;
    const tool = callId ? tools.get(callId) : undefined;
    if (!tool) continue;
    if (body.kind === "approval") tool.approval = { row, approval: body };
    else if (body.kind === "diff") tool.diffs.push({ row, diff: body });
    bumpItem(tool, rev(row));
  }
  // Nested subagents start after their parent: finish them first.
  for (let i = subagents.length - 1; i >= 0; i--) finishThread(subagents[i], isPending);
  for (const turn of turns) fold(turn);
  return { turns, subagents };
}

/** Just the turns (the main timeline). */
export function buildTurns(rows: readonly JournalRow[]): ChatTurn[] {
  return buildChat(rows).turns;
}

function toItem(row: JournalRow): ChatItem {
  const { body } = row;
  const version = rev(row);
  switch (body.kind) {
    case "message":
      return { type: "message", row, version, message: body };
    case "tool":
      return { type: "tool", row, version, call: body, approval: null, diffs: [], subagent: null };
    case "diff":
      return { type: "diff", row, version, diff: body };
    case "plan":
      return { type: "plan", row, version, plan: body };
    case "approval":
      return { type: "approval", row, version, approval: body };
    case "question":
      return { type: "question", row, version, questions: body };
    case "status":
      return { type: "status", row, version, status: body };
    case "turn":
      throw new Error("turn rows are summaries, not items");
  }
}

/** Whether a prompt still waits on the user (never folded away). */
export function isPending(item: ChatItem): boolean {
  if (item.type === "approval") return !item.approval.resolution;
  if (item.type === "question") return !item.questions.resolution;
  if (item.type === "tool") {
    return (
      (item.approval !== null && !item.approval.approval.resolution) ||
      (item.subagent?.pending ?? false)
    );
  }
  return false;
}

/** Work that can fold: not your own words, not an error, not an open prompt, not a subagent. */
function isFoldable(item: ChatItem): boolean {
  if (isPending(item)) return false;
  if (item.type === "status") return item.status.tone !== "error";
  // A subagent's card is its one stable summary: it stays put, folded or not.
  if (item.type === "tool") return item.subagent === null;
  // Your words and system notes stay; the agent's interim words and thinking fold.
  if (item.type === "message")
    return item.message.role === "assistant" || item.message.role === "reasoning";
  return true;
}

/** Fold a finished turn's work behind its last assistant message. */
function fold(turn: ChatTurn): void {
  turn.shown = turn.items;
  turn.folded = [];
  if (turn.state === "open" || turn.state === "running") return;
  let answer = -1;
  for (let i = turn.items.length - 1; i >= 0; i--) {
    const item = turn.items[i];
    if (item.type === "message" && item.message.role === "assistant") {
      answer = i;
      break;
    }
  }
  if (answer <= 0) return;
  const before = turn.items.slice(0, answer);
  const folded = before.filter(isFoldable);
  if (folded.length === 0) return;
  turn.folded = folded;
  const set = new Set<ChatItem>(folded);
  turn.shown = turn.items.filter((i) => !set.has(i));
}

/** Whether the newest turn is still going. */
export function isTurnLive(turn: ChatTurn | undefined): boolean {
  return (
    turn !== undefined &&
    (turn.state === "running" || (turn.state === "open" && turn.prompts.length > 0))
  );
}

/** Subagents still at work, background ones that outlived their turn included. */
export function runningSubagents(chat: Chat): number {
  return chat.subagents.filter((s) => s.status === "running").length;
}
