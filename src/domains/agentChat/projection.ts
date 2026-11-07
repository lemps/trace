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
// carrying its approval, its file changes and its subagent's calls, and a
// finished turn's work folded behind its final answer. Pure, so it re-runs on
// every new revision; each item and turn carries a `version` that only grows,
// so components can skip re-rendering what didn't change.

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
  /** Calls a subagent made on this call's behalf. */
  children: ToolItem[];
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
  /** What's shown: everything not folded, in order. */
  shown: ChatItem[];
  version: number;
}

const rev = (row: JournalRow) => row.revision + 1;

/** Arrange rows (sorted by `seq`) into turns. */
export function buildTurns(rows: readonly JournalRow[]): ChatTurn[] {
  const tools = new Map<string, ToolItem>();
  /** A nested call's parent, and the turn each top-level call is drawn in. */
  const parentOf = new Map<ToolItem, ToolItem>();
  const turnOf = new Map<ToolItem, ChatTurn>();
  /** A change under `tool` re-renders it, every call it's nested in, and their turn. */
  const bump = (tool: ToolItem, by: number) => {
    let at: ToolItem = tool;
    at.version += by;
    for (let up = parentOf.get(at); up; up = parentOf.get(at)) {
      up.version += by;
      at = up;
    }
    const owner = turnOf.get(at);
    if (owner) owner.version += by;
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
    const item = toItem(row);
    if (item.type === "tool") {
      tools.set(item.call.callId, item);
      const parent = item.call.parentCallId ? tools.get(item.call.parentCallId) : undefined;
      if (parent) {
        // Drawn inside its parent, wherever that is (an earlier turn, for a background agent).
        parent.children.push(item);
        parentOf.set(item, parent);
        bump(parent, item.version);
        continue;
      }
      turnOf.set(item, turn);
    }
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
    bump(tool, rev(row));
  }
  for (const turn of turns) fold(turn);
  return turns;
}

function toItem(row: JournalRow): ChatItem {
  const { body } = row;
  const version = rev(row);
  switch (body.kind) {
    case "message":
      return { type: "message", row, version, message: body };
    case "tool":
      return { type: "tool", row, version, call: body, approval: null, diffs: [], children: [] };
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
      item.children.some(isPending)
    );
  }
  return false;
}

/** Work that can fold: not your own words, not an error, not an open prompt. */
function isFoldable(item: ChatItem): boolean {
  if (isPending(item)) return false;
  if (item.type === "status") return item.status.tone !== "error";
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
  turn.shown = [...before.filter((i) => !isFoldable(i)), ...turn.items.slice(answer)];
}

/** Whether the newest turn is still going. */
export function isTurnLive(turn: ChatTurn | undefined): boolean {
  return (
    turn !== undefined &&
    (turn.state === "running" || (turn.state === "open" && turn.prompts.length > 0))
  );
}
