// Inbox: approvals and questions from every agent in one place, answered in place.
// Setup leaves two weatherline agents waiting: one with a question, one with an edit.
import { archiveSessions, ensureStarted, newSession, rail, sendChat, shown, sleep, waitNeedsYou } from "../lib/ui.mjs";

export const WAITING = [
  {
    title: "Default units",
    repo: "weatherline",
    prompt:
      "Before changing anything, use AskUserQuestion to ask me whether weatherline should default to metric or imperial units. Then make that the default in weatherline/cli.py.",
  },
  {
    title: "Add a --json flag",
    repo: "weatherline",
    prompt: "Add a --json flag to weatherline/cli.py that prints the observation as JSON instead of the line.",
  },
];

export const clip = { segments: [["start+0.5", "allowed+4.9", 1]] };

/** Fresh sessions for both, each left waiting on you. */
export async function seedWaiting(d) {
  for (const s of WAITING) {
    await archiveSessions(d, s.title);
    await newSession(d, s);
    await ensureStarted(d);
    await sendChat(d, s.prompt, 2);
    await waitNeedsYou(d);
  }
}

export async function setup(d) {
  await seedWaiting(d);
  await rail(d, "Inbox");
  await sleep(800);
}

export async function run(d, mark) {
  await sleep(1500);
  await d.click("main *", "Default units");
  await sleep(1500);
  await d.click("label, button, [role=radio]", "Metric");
  await sleep(900);
  // A chat agent's question card waits for Answer; a terminal agent's menu answers on the pick.
  if (await shown(d, ".ac-question .ac-ask-actions .btn.primary-needs")) await d.click(".ac-question .ac-ask-actions .btn.primary-needs");
  mark("answered question");
  await sleep(1800);
  await d.click("main *", "Add a --json flag");
  await sleep(2200);
  await d.click(".btn.primary-needs");
  mark("allowed");
  await sleep(5500);
}
