import type { ChatActions } from "../actions";
import { useAgentChatStore } from "../store";
import type { Answer, JournalBody, JournalRow } from "../types";
import { FIXTURE_INFO, FIXTURE_ROWS } from "./fixture";

// A pretend agent for the fixture page: answers resolve their card, a message
// gets a short reply a moment later, Esc interrupts. Writes go straight into the
// store, as the backend's events would.

export const FIXTURE_WS = "dev:chat-fixture";

let seq = 10_000;
let turnNo = 100;

function put(id: string, body: JournalBody, turnId?: string, revision = 0): void {
  const row: JournalRow = { id, revision, seq: ++seq, at: Date.now(), turnId, body };
  useAgentChatStore.getState().applyRows(FIXTURE_WS, [row]);
}

function setBusy(busy: boolean): void {
  const s = useAgentChatStore.getState();
  s.setInfo(FIXTURE_WS, { ...(s.info[FIXTURE_WS] ?? FIXTURE_INFO), busy });
}

/** Put the fixture journal (back) in the store. */
export function seedFixture(): void {
  const s = useAgentChatStore.getState();
  useAgentChatStore.setState({
    journals: { ...s.journals, [FIXTURE_WS]: { byId: {}, rows: [] } },
  });
  s.applyRows(FIXTURE_WS, FIXTURE_ROWS);
  s.setInfo(FIXTURE_WS, FIXTURE_INFO);
  s.markLoaded(FIXTURE_WS);
}

function resolve(requestId: string, answer: Answer): void {
  const rows = useAgentChatStore.getState().journals[FIXTURE_WS]?.rows ?? [];
  const row = rows.find(
    (r) =>
      (r.body.kind === "approval" || r.body.kind === "question") && r.body.requestId === requestId
  );
  if (!row || (row.body.kind !== "approval" && row.body.kind !== "question")) return;
  const body = { ...row.body, resolution: { state: "answered" as const, answer } };
  useAgentChatStore
    .getState()
    .applyRows(FIXTURE_WS, [{ ...row, revision: row.revision + 1, body }]);
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

export const fixtureActions: ChatActions = {
  load: async () => [],
  start: async () => setBusy(false),
  answer: async (_ws, requestId, answer) => {
    await wait(250);
    resolve(requestId, answer);
  },
  send: async (_ws, message) => {
    turnNo += 1;
    const turnId = `t${turnNo}`;
    put(
      `u${turnNo}`,
      { kind: "message", role: "user", text: message.text, streaming: false },
      turnId
    );
    put(`s${turnNo}`, { kind: "turn", turnId, state: "running" }, turnId);
    setBusy(true);
    await wait(1200);
    put(
      `a${turnNo}`,
      {
        kind: "message",
        role: "assistant",
        text: `(fixture) You said: **${message.text}**`,
        streaming: false,
      },
      turnId
    );
    put(
      `s${turnNo}`,
      {
        kind: "turn",
        turnId,
        state: "completed",
        durationMs: 1200,
        usage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
      turnId,
      1
    );
    setBusy(false);
  },
  interrupt: async () => {
    put(`int${++seq}`, { kind: "status", text: "Interrupted by you.", tone: "info" });
    setBusy(false);
  },
  stop: async () => setBusy(false),
};
