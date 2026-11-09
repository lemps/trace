// Scheduled prompts with a precheck: a prompt that runs itself, only when there's work.
import { rail, sleep } from "../lib/ui.mjs";

const NAME = "Morning test run";

export const clip = {
  segments: [
    ["start+0.5", "scheduled", 1.5],
    ["scheduled", "end", 1.3],
  ],
};

const fill = async (d, selector, text, delay = 22) => {
  await d.click(selector);
  // Replace what the field already holds (CLI flags start from Settings → Agents).
  await d.eval((s) => [...document.querySelectorAll(s)].find((e) => e.getClientRects().length)?.select(), selector);
  await d.type(text, delay);
};

export async function setup(d) {
  await rail(d, "Scheduled prompts");
  // Remove the prompt an earlier take made.
  while (await d.eval((n) => [...document.querySelectorAll("main *")].some((e) => e.children.length === 0 && e.textContent.trim() === n), NAME)) {
    await d.click("main *", NAME);
    await sleep(800);
    await d.click("button", "Delete");
    // The inline confirm's button is Delete again (btn danger).
    await d.click("button.danger", "Delete");
    await sleep(1000);
    await rail(d, "Scheduled prompts");
  }
}

export async function run(d, mark) {
  await sleep(800);
  await d.click("button", "New scheduled prompt");
  await sleep(900);
  await fill(d, '[role=dialog] input[placeholder^="e.g. Morning"]', NAME);
  await sleep(300);
  await fill(d, "[role=dialog] textarea", "Run npm test. If anything fails since {lastRunAt}, find the commit that broke it and summarise the fix.", 14);
  await sleep(400);
  await d.click("[role=dialog] button", "Weekly");
  await sleep(900);
  await d.click("[role=dialog] button", "Daily");
  await sleep(600);
  await fill(d, '[role=dialog] input[placeholder^="--dangerously"]', '--allowedTools "Bash(npm test)"', 18);
  mark("precheck");
  await d.eval(() => {
    const box = [...document.querySelectorAll("[role=dialog] *")].find(
      (e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible",
    );
    box?.scrollBy({ top: 600, behavior: "smooth" });
  });
  await sleep(1200);
  // The precheck is the mono field after the CLI flags.
  await fill(d, "[role=dialog] label.field input.sched-mono[placeholder^='e.g. ']", `git fetch -q && git status -sb | ${process.platform === "win32" ? "findstr" : "grep"} behind`, 20);
  await sleep(1500);
  await d.click("[role=dialog] button", "Schedule");
  mark("scheduled");
  await sleep(1800);
  await d.click("main *", NAME);
  await sleep(3500);
}
