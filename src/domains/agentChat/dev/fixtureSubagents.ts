import type { JournalBody, JournalRow, Subagent } from "../types.ts";
import { row, say, user } from "./fixtureRows.ts";

// A turn with two subagents working in parallel (their rows interleaved, as
// Claude sends them), and a background one that finishes after the turn: the
// fixture page's subagent cards and tabs, and the projection tests' data.

const done = (s: Partial<Subagent>): Subagent => ({
  background: false,
  state: "completed",
  ...s,
});

const sub = (
  id: string,
  callId: string,
  parent: string,
  name: string,
  input: unknown,
  output: string
): JournalRow =>
  row(
    id,
    "t6",
    { kind: "tool", callId, parentCallId: parent, name, input, state: "completed", output },
    1
  );

const subSay = (id: string, parent: string, text: string, role: "assistant" | "reasoning") =>
  row(id, "t6", { kind: "message", role, text, streaming: false, parentCallId: parent }, 1);

const launch = (id: string, callId: string, input: unknown, s: Subagent, output: string) =>
  row(
    id,
    "t6",
    { kind: "tool", callId, name: "Agent", input, state: "completed", output, subagent: s },
    6
  );

const AUTH =
  "Find where sign-in tokens are read and written. Report file paths and one line on each.";
const PARSE =
  "Make `parseRank` in src/domains/board/rank.ts accept a missing rank (treat it as the end). Keep the change small.";

export function subagentTurn(): JournalRow[] {
  return [
    user(
      "u6",
      "t6",
      "Use two subagents in parallel: one maps the auth code, one fixes `parseRank`."
    ),
    say("a6a", "t6", "I'll run both at once."),
    launch(
      "sa-auth",
      "s1",
      { subagent_type: "Explore", description: "Find the auth code", prompt: AUTH },
      done({
        agentType: "Explore",
        description: "Find the auth code",
        toolUses: 3,
        durationMs: 14_000,
        result:
          "- `src-tauri/src/github/token.rs` stores the token (0600 file).\n- `src/ipc/github.ts` reads whether one is set; the token never crosses.",
      }),
      "Done."
    ),
    launch(
      "sa-parse",
      "s2",
      { subagent_type: "general-purpose", description: "Fix parseRank", prompt: PARSE },
      done({
        agentType: "general-purpose",
        description: "Fix parseRank",
        toolUses: 3,
        durationMs: 21_000,
        result: "`parseRank` now returns `Infinity` for a missing rank; its test covers it.",
      }),
      "Done."
    ),
    subSay(
      "s1r",
      "s1",
      "Tokens: look for a store module under github/, then its readers.",
      "reasoning"
    ),
    sub(
      "s1t1",
      "s1a",
      "s1",
      "Glob",
      { pattern: "src-tauri/src/github/**/*.rs" },
      "src-tauri/src/github/token.rs\nsrc-tauri/src/github/clone.rs"
    ),
    subSay("s2a", "s2", "Reading `rank.ts` first.", "assistant"),
    sub(
      "s2t1",
      "s2a1",
      "s2",
      "Read",
      { file_path: "C:/work/trace/src/domains/board/rank.ts" },
      "export function parseRank(r: string) {\n  return Number(r);\n}"
    ),
    sub("s1t2", "s1b", "s1", "Grep", { pattern: "token", path: "src/ipc" }, "src/ipc/github.ts:14"),
    sub(
      "s2t2",
      "s2b",
      "s2",
      "Edit",
      {
        file_path: "C:/work/trace/src/domains/board/rank.ts",
        old_string: "  return Number(r);",
        new_string: "  return r ? Number(r) : Number.POSITIVE_INFINITY;",
      },
      "The file was updated."
    ),
    row("s2d", "t6", {
      kind: "diff",
      callId: "s2b",
      path: "C:/work/trace/src/domains/board/rank.ts",
      change: "edit",
      before: "  return Number(r);",
      after: "  return r ? Number(r) : Number.POSITIVE_INFINITY;",
    }),
    sub(
      "s1t3",
      "s1c",
      "s1",
      "Read",
      { file_path: "C:/work/trace/src/ipc/github.ts" },
      "export function githubSignedIn() { … }"
    ),
    sub(
      "s2t3",
      "s2c",
      "s2",
      "Bash",
      { command: "npm test -- rank", description: "Run the rank tests" },
      "✔ ranks (0.7ms)\n✔ missing rank (0.2ms)\nℹ pass 2"
    ),
    subSay(
      "s2z",
      "s2",
      "`parseRank` now returns `Infinity` for a missing rank; its test covers it.",
      "assistant"
    ),
    launch(
      "sa-bg",
      "s3",
      {
        subagent_type: "Explore",
        description: "Look for other rank parsers",
        prompt: "Any other code that parses ranks?",
        run_in_background: true,
      },
      done({
        agentType: "Explore",
        description: "Look for other rank parsers",
        background: true,
        toolUses: 1,
        durationMs: 31_000,
        result: "Only `rank.ts` parses ranks.",
      }),
      "Async agent launched."
    ),
    say(
      "a6b",
      "t6",
      "Both are done: the auth code is mapped and `parseRank` is fixed. A background check for other rank parsers is still going."
    ),
    row(
      "turn6",
      "t6",
      { kind: "turn", turnId: "t6", state: "completed", durationMs: 24_000 } as JournalBody,
      1
    ),
    // The background one's work lands after its turn ended.
    sub(
      "s3t1",
      "s3a",
      "s3",
      "Grep",
      { pattern: "parseRank|rank\\(", path: "src" },
      "src/domains/board/rank.ts:1"
    ),
  ];
}
