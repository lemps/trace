import { useBoardStore } from "@/domains/board/store";
import { askIsOver, noteAgentTurn, noteTurnOver } from "@/domains/board/waitingNotify";
import { noteLiveAsk } from "@/domains/live/sync";
import { useAgentChatStore } from "./store";
import type { JournalRow, SessionInfo } from "./types";

// A chat agent's state, told to the board and live stores the way a terminal
// agent's PTY output and hooks tell them: busy is "working", the end of a turn
// is "waiting" (and the notification), and an open approval or question is
// "needs you" with what it asks. So the board, Fleet, Inbox and notifications
// read chat agents exactly as they read terminal ones. A chat agent has no PTY
// output, so nothing here runs the terminal's quiet timers.

/** Open approval / question request ids per workspace. */
const open = new Map<string, Set<string>>();

/** Call before storing `info`: acts on how `busy` changed. */
export function noteChatInfo(workspaceId: string, info: SessionInfo): void {
  const prev = useAgentChatStore.getState().info[workspaceId];
  const board = useBoardStore.getState();
  if (info.busy && prev?.busy !== true) {
    // A new turn is new work (a message, the kickoff brief): its end is news.
    if (prev) board.noteUserTurn(workspaceId);
    board.setActivity(workspaceId, "working");
  } else if (!info.busy && prev?.busy === true) {
    // The turn's end cancels what it still asked, whichever arrives first.
    if (open.delete(workspaceId)) askIsOver(workspaceId);
    noteTurnOver(workspaceId);
  }
}

/** Rows as they arrive: an approval or question opening or closing. */
export function noteChatRows(workspaceId: string, rows: readonly JournalRow[]): void {
  for (const row of rows) {
    const body = row.body;
    if (body.kind !== "approval" && body.kind !== "question") continue;
    const ids = open.get(workspaceId) ?? new Set<string>();
    if (body.resolution) {
      if (!ids.delete(body.requestId)) continue;
      if (ids.size === 0) {
        open.delete(workspaceId);
        askIsOver(workspaceId);
        // Answered: the turn carries on.
        if (useAgentChatStore.getState().info[workspaceId]?.busy !== false) {
          useBoardStore.getState().setActivity(workspaceId, "working");
        }
      }
      continue;
    }
    if (ids.has(body.requestId)) continue;
    ids.add(body.requestId);
    open.set(workspaceId, ids);
    if (body.kind === "approval") {
      noteLiveAsk({
        workspaceId,
        tool: body.tool,
        detail: body.detail ?? body.title,
        options: [],
        multiSelect: false,
        questions: 0,
        canAlwaysAllow: body.options.some((o) => o.kind === "allowAlways"),
      });
    } else {
      const first = body.questions[0];
      noteLiveAsk({
        workspaceId,
        tool: "AskUserQuestion",
        detail: first?.text ?? null,
        // Answered in the chat's own card (Inbox shows it), never by keys.
        options: [],
        multiSelect: first?.multiSelect ?? false,
        questions: body.questions.length,
        canAlwaysAllow: false,
      });
    }
    noteAgentTurn({ workspaceId, event: "needsInput", backgroundTasks: 0 });
  }
}

/**
 * Right after a start: the run-state just said "working", but an agent started
 * with nothing to do is idle at its prompt, which isn't news.
 */
export function syncChatActivity(workspaceId: string): void {
  const info = useAgentChatStore.getState().info[workspaceId];
  if (!info || info.busy) return;
  const board = useBoardStore.getState();
  board.setActivity(workspaceId, "waiting");
  board.ackWaiting(workspaceId);
}
