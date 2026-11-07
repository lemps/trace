// The orchestrator: ask what your agents are doing, then its stats.
// Needs Settings → Assistant set to "Claude CLI (-p mode)" or an API key; setup picks the CLI.
import { ROUTER, ensureSession, pick, rail, sleep } from "../lib/ui.mjs";
import { SORTER } from "./subagents.mjs";

export const clip = {
  segments: [
    ["start+0.3", "asked", 1],
    ["asked", "answered", 2.5],
    ["answered", "end", 1],
  ],
};

export async function setup(d) {
  // The orchestrator's chat lives in the page: a reload starts a new conversation.
  await d.eval(() => location.reload());
  await sleep(4000);
  await d.viewport(1280, 800);
  await ensureSession(d, ROUTER);
  await ensureSession(d, { ...SORTER, seed: "Explain src/sort.rs in two sentences. Don't edit anything." });
  await d.click('button[aria-label="Settings"]');
  await sleep(600);
  await d.click("main button", "Assistant");
  await sleep(600);
  await pick(d, "main", "Claude CLI (-p mode)");
  await sleep(400);
  await rail(d, "Sessions");
  if (await d.eval(() => !!document.querySelector('button[aria-label="Show orchestrator"]'))) {
    await d.click('button[aria-label="Show orchestrator"]');
  }
  await sleep(1000);
  await sleep(800);
}

export async function run(d, mark) {
  await sleep(1200);
  await d.click(".side-panel button", "What are my agents doing?");
  mark("asked");
  await sleep(3000);
  // Done when the reply has stopped growing for two seconds.
  let last = -1;
  for (let i = 0; i < 240; i++) {
    const n = await d.eval(() => document.querySelector(".side-panel")?.innerText.length ?? 0);
    if (n === last && n > 400) break;
    last = n;
    await sleep(2000);
  }
  mark("answered");
  await sleep(3500);
  await d.click(".side-panel button", "Stats");
  mark("stats");
  await sleep(4500);
}
