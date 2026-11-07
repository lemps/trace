import { useAgentChatStore } from "../store";
import type { JournalBody, JournalRow, Subagent } from "../types";
import { FIXTURE_INFO } from "./fixture";

// Dev only: a turn with two subagents played into the fixture journal step by
// step, their calls interleaved and each one running before it completes, as
// a live agent sends them. For watching cards and tabs update in place.

const WS = "dev:chat-fixture";
let seq = 50_000;
let run = 0;
const revs = new Map<string, number>();

function put(id: string, body: JournalBody, turnId: string): void {
  const revision = revs.has(id) ? (revs.get(id) ?? 0) + 1 : 0;
  revs.set(id, revision);
  const s = useAgentChatStore.getState();
  const old = s.journals[WS]?.byId[id];
  const row: JournalRow = {
    id,
    revision,
    seq: old?.seq ?? ++seq,
    at: old?.at ?? Date.now(),
    turnId,
    body,
  };
  s.applyRows(WS, [row]);
}

function info(busy: boolean, runningSubagents: number): void {
  const s = useAgentChatStore.getState();
  s.setInfo(WS, { ...(s.info[WS] ?? FIXTURE_INFO), busy, runningSubagents });
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** Play the turn; resolves when it's over. `step` is the pause between rows. */
export async function playSubagents(step = 700): Promise<void> {
  run += 1;
  const n = run;
  const t = `play${n}`;
  const k = (id: string) => `${id}-${n}`;
  const agent = (id: string, input: Record<string, unknown>, s: Subagent, output?: string) =>
    put(
      k(id),
      {
        kind: "tool",
        callId: k(id),
        name: "Agent",
        input,
        state: output === undefined ? "running" : "completed",
        output,
        subagent: s,
      },
      t
    );
  const call = (id: string, parent: string, name: string, input: unknown, output?: string) =>
    put(
      k(id),
      {
        kind: "tool",
        callId: k(id),
        parentCallId: k(parent),
        name,
        input,
        state: output === undefined ? "running" : "completed",
        output,
      },
      t
    );
  const said = (
    id: string,
    parent: string | null,
    text: string,
    role: "assistant" | "reasoning" = "assistant"
  ) =>
    put(
      k(id),
      {
        kind: "message",
        role,
        text,
        streaming: false,
        parentCallId: parent ? k(parent) : undefined,
      },
      t
    );

  const a = {
    subagent_type: "Explore",
    description: "List folder a",
    prompt: "List the files in folder a.",
  };
  const b = {
    subagent_type: "Explore",
    description: "List folder b",
    prompt: "List the files in folder b.",
  };
  const running = (s: typeof a): Subagent => ({
    agentType: s.subagent_type,
    description: s.description,
    background: false,
    state: "running",
  });

  put(
    k("u"),
    {
      kind: "message",
      role: "user",
      text: "Use two Explore subagents in parallel to list folders a and b.",
      streaming: false,
    },
    t
  );
  put(k("turn"), { kind: "turn", turnId: t, state: "running" }, t);
  info(true, 0);
  const steps: (() => void)[] = [
    () => said("r", null, "Two independent listings: one subagent each.", "reasoning"),
    () => {
      agent("A", a, running(a));
      info(true, 1);
    },
    () => {
      agent("B", b, running(b));
      info(true, 2);
    },
    () => said("Ar", "A", "Glob the folder, then report.", "reasoning"),
    () => call("A1", "A", "Glob", { pattern: "a/**/*" }),
    () => call("B1", "B", "Glob", { pattern: "b/**/*" }),
    () => call("A1", "A", "Glob", { pattern: "a/**/*" }, "a/one.txt\na/two.txt"),
    () => call("A2", "A", "Read", { file_path: "a/one.txt" }),
    () => call("B1", "B", "Glob", { pattern: "b/**/*" }, "b/three.txt\nb/four.md"),
    () => call("B2", "B", "Read", { file_path: "b/four.md" }),
    () => call("A2", "A", "Read", { file_path: "a/one.txt" }, "one"),
    () => said("Az", "A", "a: one.txt, two.txt"),
    () => {
      agent(
        "A",
        a,
        {
          ...running(a),
          state: "completed",
          toolUses: 2,
          durationMs: 5200,
          result: "a: one.txt, two.txt",
        },
        "a: one.txt, two.txt"
      );
      info(true, 1);
    },
    () => call("B2", "B", "Read", { file_path: "b/four.md" }, "four"),
    () => call("B3", "B", "Grep", { pattern: "three", path: "b" }),
    () => call("B3", "B", "Grep", { pattern: "three", path: "b" }, "b/three.txt:1"),
    () => said("Bz", "B", "b: three.txt, four.md"),
    () => {
      agent(
        "B",
        b,
        {
          ...running(b),
          state: "completed",
          toolUses: 3,
          durationMs: 7900,
          result: "b: three.txt, four.md",
        },
        "b: three.txt, four.md"
      );
      info(true, 0);
    },
    () => said("ans", null, "a: one.txt, two.txt · b: three.txt, four.md"),
  ];
  for (const s of steps) {
    await wait(step);
    if (n !== run) return;
    s();
  }
  await wait(step);
  put(
    k("turn"),
    {
      kind: "turn",
      turnId: t,
      state: "completed",
      durationMs: step * steps.length,
      usage: { inputTokens: 4200, outputTokens: 180, cacheReadTokens: 30_000, cacheWriteTokens: 0 },
    },
    t
  );
  info(false, 0);
}
