import type { JournalRow, SessionInfo } from "../types.ts";

// A made-up journal covering every row kind across five turns, for building and
// screenshotting the chat UI without a backend (dev/ChatFixturePage, dev only)
// and for the projection tests. Never imported by shipped code.

import { COLUMN_BEFORE, editTurn } from "./fixtureEdits.ts";
import { markdownTurn } from "./fixtureMarkdown.ts";
import { row, say, T0, user } from "./fixtureRows.ts";

export const FIXTURE_ROWS: JournalRow[] = [
  // Turn 1: a question, some reading, an answer.
  user("u1", "t1", "Why does the board flicker when I drag a card between columns?"),
  say(
    "r1",
    "t1",
    "The flicker is probably a re-render storm during dragover. I should check how `Column` sorts its cards and whether `onDragOver` sets state on every event.",
    "reasoning"
  ),
  say("a1a", "t1", "Let me look at the drag handler and the column's render path."),
  row(
    "tool-grep",
    "t1",
    {
      kind: "tool",
      callId: "c1",
      name: "Grep",
      input: { pattern: "onDragOver", path: "src/domains/board" },
      state: "completed",
      output: "src/domains/board/Column.tsx:42\nsrc/domains/board/Card.tsx:88",
    },
    1
  ),
  row(
    "tool-read",
    "t1",
    {
      kind: "tool",
      callId: "c2",
      name: "Read",
      input: { file_path: "C:/work/trace/src/domains/board/Column.tsx" },
      state: "completed",
      output: COLUMN_BEFORE,
    },
    1
  ),
  row(
    "tool-test",
    "t1",
    {
      kind: "tool",
      callId: "c3",
      name: "Bash",
      input: { command: "npm test -- board", description: "Run the board tests" },
      state: "completed",
      output: "✔ columns (2.1ms)\n✔ ranks (0.8ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0",
    },
    1
  ),
  say(
    "a1",
    "t1",
    "Two things in `src/domains/board/Column.tsx:42` cause it:\n\n1. **`cards.sort(byRank)` sorts in place**, mutating the store's array, so every render hands React a new order.\n2. `onDragOver` calls `setOver(true)` on *every* dragover event (dozens a second), re-rendering the whole column each time.\n\n```tsx\nconst sorted = useMemo(() => [...cards].sort(byRank), [cards]);\n```\n\nWant me to fix both and add a test?"
  ),
  row("turn1", "t1", {
    kind: "turn",
    turnId: "t1",
    state: "completed",
    durationMs: 48_000,
    usage: {
      inputTokens: 18_420,
      outputTokens: 1_310,
      cacheReadTokens: 41_000,
      cacheWriteTokens: 2_200,
      costUsd: 0.083,
    },
  }),

  ...editTurn(),

  ...markdownTurn(),

  // Turn 3: interrupted part-way.
  user("u3", "t3", "Also make the drop indicator animate"),
  row("sys", "t3", {
    kind: "message",
    role: "system",
    text: "Model switched to claude-sonnet-5-5",
    streaming: false,
  }),
  say("a3", "t3", "I'll add a short transition to `.drop-indicator` in"),
  row("st-int", "t3", { kind: "status", text: "Interrupted by you.", tone: "info" }),
  row("turn3", "t3", { kind: "turn", turnId: "t3", state: "interrupted", durationMs: 6_000 }),

  // Turn 4: failed.
  user("u4", "t4", "/compact"),
  row("st-fail", "t4", {
    kind: "status",
    text: "Compaction failed: the conversation is too short to compact.",
    tone: "error",
  }),
  row("turn4", "t4", { kind: "turn", turnId: "t4", state: "failed", durationMs: 900 }),

  // Turn 5: running, waiting on an approval and a question.
  user("u5", "t5", "Ship it: commit, push and open a PR against main."),
  row(
    "r5",
    "t5",
    {
      kind: "message",
      role: "reasoning",
      text: "I need to commit first, then push the branch. Pushing needs permission.",
      streaming: true,
    },
    2
  ),
  row(
    "tool-commit",
    "t5",
    {
      kind: "tool",
      callId: "c12",
      name: "Bash",
      input: { command: 'git commit -am "Board: stop the drag flicker"' },
      state: "completed",
      output:
        "[workspace/trace-12 4f2a9c1] Board: stop the drag flicker\n 3 files changed, 18 insertions(+), 4 deletions(-)",
    },
    1
  ),
  row("tool-push", "t5", {
    kind: "tool",
    callId: "c13",
    name: "Bash",
    input: { command: "git push -u origin workspace/trace-12" },
    state: "running",
  }),
  row("appr-push", "t5", {
    kind: "approval",
    requestId: "req-4",
    callId: "c13",
    tool: "Bash",
    title: "Push to origin",
    detail: "git push -u origin workspace/trace-12",
    options: [
      { id: "once", label: "Allow once", kind: "allowOnce" },
      { id: "always", label: "Always allow git push", kind: "allowAlways" },
      { id: "deny", label: "Deny", kind: "deny" },
    ],
  }),
  row("q-open", "t5", {
    kind: "question",
    requestId: "req-5",
    questions: [
      {
        id: "title",
        header: "PR title",
        text: "Which title should the PR use?",
        options: [
          { label: "Board: stop the drag flicker", description: "Matches the commit" },
          { label: "Fix board flicker on drag", description: "Shorter" },
        ],
        multiSelect: false,
        allowFreeText: true,
      },
      {
        id: "labels",
        header: "Labels",
        text: "Which labels apply?",
        options: [{ label: "bug" }, { label: "board" }, { label: "performance" }],
        multiSelect: true,
        allowFreeText: false,
      },
    ],
  }),
  row(
    "mcp",
    "t5",
    {
      kind: "tool",
      callId: "c14",
      name: "mcp__trace__update_user",
      input: { message: "Pushing the fix" },
      state: "completed",
    },
    1
  ),
];

export const FIXTURE_INFO: SessionInfo = {
  agent: "claude",
  model: "claude-opus-5-5",
  conversationId: "8c1f0e5a-0000-4000-8000-000000000000",
  slashCommands: [
    "compact",
    "clear",
    "review",
    "init",
    "cost",
    "model",
    "pr-comments",
    "security-review",
  ],
  busy: true,
  limits: [
    { name: "five_hour", utilization: 0.42, resetsAt: Math.floor(T0 / 1000) + 2 * 3600 },
    { name: "seven_day", utilization: 0.81, resetsAt: Math.floor(T0 / 1000) + 3 * 86400 },
  ],
};
