import type { JournalRow } from "../types.ts";
import { row, say, user } from "./fixtureRows.ts";

// The fixture's second turn: a plan, edits with diffs (before/after, a new
// file, a Codex patch), an approval, a question, a subagent and a warning.

export const COLUMN_BEFORE = `export function Column({ column, cards }: ColumnProps) {
  const [over, setOver] = useState(false);
  const sorted = cards.sort(byRank);
  return (
    <div className="col" onDragOver={() => setOver(true)}>
      {sorted.map((c) => <Card key={c.key} card={c} />)}
    </div>
  );
}`;
const COLUMN_AFTER = `export function Column({ column, cards }: ColumnProps) {
  const [over, setOver] = useState(false);
  const sorted = useMemo(() => [...cards].sort(byRank), [cards]);
  return (
    <div className="col" onDragOver={() => !over && setOver(true)}>
      {sorted.map((c) => <Card key={c.key} card={c} />)}
    </div>
  );
}`;

/** Made on call, so its rows take their place in the journal's order. */
export function editTurn(): JournalRow[] {
  return [
    // Turn 2: a plan, edits with diffs, an approval, a question, a subagent.
    user("u2", "t2", "Yes, fix both and add a test. Keep the change small."),
    row(
      "plan",
      "t2",
      {
        kind: "plan",
        items: [
          { text: "Copy before sorting in Column", status: "done" },
          { text: "Only set `over` when it changes", status: "done" },
          { text: "Add a regression test for ranks", status: "done" },
          { text: "Run the suite", status: "done" },
        ],
      },
      4
    ),
    row(
      "tool-edit",
      "t2",
      {
        kind: "tool",
        callId: "c4",
        name: "Edit",
        input: {
          file_path: "C:/work/trace/src/domains/board/Column.tsx",
          old_string: "cards.sort",
          new_string: "[...cards].sort",
        },
        state: "completed",
        output: "The file was updated.",
      },
      1
    ),
    row("diff-edit", "t2", {
      kind: "diff",
      callId: "c4",
      path: "C:/work/trace/src/domains/board/Column.tsx",
      change: "edit",
      before: COLUMN_BEFORE,
      after: COLUMN_AFTER,
    }),
    row(
      "tool-write",
      "t2",
      {
        kind: "tool",
        callId: "c5",
        name: "Write",
        input: { file_path: "C:/work/trace/src/domains/board/columns.test.ts", content: "…" },
        state: "completed",
      },
      1
    ),
    row("diff-write", "t2", {
      kind: "diff",
      callId: "c5",
      path: "C:/work/trace/src/domains/board/columns.test.ts",
      change: "add",
      after:
        'import assert from "node:assert/strict";\nimport { it } from "node:test";\nimport { byRank } from "./columns.ts";\n\nit("sorts without mutating", () => {\n  const cards = [{ rank: 2 }, { rank: 1 }];\n  const sorted = [...cards].sort(byRank);\n  assert.deepEqual(cards.map((c) => c.rank), [2, 1]);\n  assert.deepEqual(sorted.map((c) => c.rank), [1, 2]);\n});',
    }),
    row(
      "tool-codex",
      "t2",
      {
        kind: "tool",
        callId: "c6",
        name: "apply_patch",
        input: {
          input:
            "*** Begin Patch\n*** Update File: src/domains/board/Card.tsx\n@@\n-  onDragOver={onOver}\n+  onDragOver={over ? undefined : onOver}\n*** End Patch",
        },
        state: "completed",
      },
      1
    ),
    row("diff-patch", "t2", {
      kind: "diff",
      path: "src/domains/board/Card.tsx",
      change: "edit",
      patch:
        "@@ -86,5 +86,5 @@ export function Card({ card }: CardProps) {\n   return (\n     <div\n       draggable\n-      onDragOver={onOver}\n+      onDragOver={over ? undefined : onOver}\n     >",
    }),
    row(
      "tool-npm",
      "t2",
      {
        kind: "tool",
        callId: "c7",
        name: "Bash",
        input: { command: "npm test" },
        state: "failed",
        output:
          "✖ ranks\n  AssertionError: Expected [1, 2] but got [2, 1]\n    at columns.test.ts:9:10",
      },
      2
    ),
    row(
      "appr-npm",
      "t2",
      {
        kind: "approval",
        requestId: "req-1",
        callId: "c7",
        tool: "Bash",
        title: "Run npm test",
        detail: "npm test",
        options: [
          { id: "once", label: "Allow once", kind: "allowOnce" },
          { id: "always", label: "Always allow npm test", kind: "allowAlways" },
          { id: "deny", label: "Deny", kind: "deny" },
        ],
        resolution: { state: "answered", answer: { kind: "approval", optionId: "always" } },
      },
      1
    ),
    row(
      "tool-shell",
      "t2",
      {
        kind: "tool",
        callId: "c8",
        name: "shell",
        input: { command: ["bash", "-lc", "npm test -- --test-name-pattern ranks"] },
        state: "completed",
        output: "✔ ranks (0.9ms)\nℹ pass 1",
      },
      1
    ),
    row(
      "tool-task",
      "t2",
      {
        kind: "tool",
        callId: "c9",
        name: "Task",
        input: {
          description: "Check other columns sort in place",
          subagent_type: "Explore",
          prompt: "Find every `.sort(` on store arrays under src/domains.",
        },
        state: "completed",
        output: "Only Column.tsx sorted a store array in place; Fleet and Inbox copy first.",
      },
      2
    ),
    row(
      "tool-sub1",
      "t2",
      {
        kind: "tool",
        callId: "c10",
        parentCallId: "c9",
        name: "Grep",
        input: { pattern: "\\.sort\\(", path: "src/domains" },
        state: "completed",
        output: "src/domains/fleet/order.ts:12\nsrc/domains/inbox/rank.ts:30",
      },
      1
    ),
    row(
      "tool-sub2",
      "t2",
      {
        kind: "tool",
        callId: "c11",
        parentCallId: "c9",
        name: "Read",
        input: { file_path: "C:/work/trace/src/domains/fleet/order.ts" },
        state: "completed",
      },
      1
    ),
    row(
      "appr-web",
      "t2",
      {
        kind: "approval",
        requestId: "req-2",
        tool: "WebFetch",
        title: "Fetch react.dev/reference/react/useMemo",
        options: [
          { id: "once", label: "Allow once", kind: "allowOnce" },
          { id: "deny", label: "Deny", kind: "deny" },
        ],
        resolution: {
          state: "answered",
          answer: { kind: "approval", optionId: "deny", note: "Not needed" },
        },
      },
      1
    ),
    row(
      "q-done",
      "t2",
      {
        kind: "question",
        requestId: "req-3",
        questions: [
          {
            id: "q1",
            header: "Test style",
            text: "Where should the regression test live?",
            options: [
              { label: "Next to columns.ts", description: "src/domains/board/columns.test.ts" },
              { label: "In scripts/", description: "With the transcript tests" },
            ],
            multiSelect: false,
            allowFreeText: true,
          },
        ],
        resolution: {
          state: "answered",
          answer: { kind: "questions", answers: { q1: ["Next to columns.ts"] } },
        },
      },
      1
    ),
    row("st-ctx", "t2", {
      kind: "status",
      text: "Context is 80% full; older tool output will be summarised.",
      tone: "warning",
    }),
    say(
      "a2",
      "t2",
      "Fixed both:\n\n- `Column` now sorts a copy, memoised on `cards`.\n- `onDragOver` only sets `over` when it isn't already set; `Card.tsx` skips the handler while hovering.\n\nAdded `src/domains/board/columns.test.ts`. The suite passes."
    ),
    row("turn2", "t2", {
      kind: "turn",
      turnId: "t2",
      state: "completed",
      durationMs: 3 * 60_000 + 12_000,
      usage: {
        inputTokens: 64_900,
        outputTokens: 5_870,
        cacheReadTokens: 212_000,
        cacheWriteTokens: 9_100,
        costUsd: 0.412,
      },
    }),
  ];
}
