// Fleet: every running agent at a glance; rows keep their place as states change.
import { ROUTER, ensureSession, rail, sendChat, sleep } from "../lib/ui.mjs";
import { seedWaiting } from "./inbox.mjs";
import { SORTER } from "./subagents.mjs";

export const clip = { segments: [["start+0.3", "end-0.1", 1]] };

export async function setup(d) {
  // Ready agents, two waiting on you, and one we set working just before the take.
  await ensureSession(d, ROUTER);
  await ensureSession(d, { ...SORTER, seed: "Explain src/sort.rs in two sentences. Don't edit anything." });
  await seedWaiting(d);
  await ensureSession(d, SORTER);
  await sendChat(d, "Suggest three more test cases for sort_row in a short list. Read the code first; don't write any files.", 2);
  await sleep(1500);
  await rail(d, "Fleet");
  await sleep(1000);
}

export async function run(d, mark) {
  await sleep(2500);
  await d.click("main button", "Needs you");
  mark("needs you");
  await sleep(2200);
  await d.click("main button", "Working");
  await sleep(2200);
  await d.click("main button", "All");
  mark("all");
  // Hold until the working agent finishes, so a row changes state in place.
  await d.waitFor(() => !/\bWorking\b(?!\s*\d)/.test(document.querySelector("main")?.innerText ?? ""), 90000).catch(() => {});
  mark("changed");
  await sleep(2500);
}
