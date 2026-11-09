// Agents as a chat: a prompt, tool cards, an approval answered in place, the diff,
// the test run, and a Markdown reply with a table; then the reply's hover bar.
// Starts a fresh Claude chat session in the tinyroute demo repo each take. It
// keeps ROUTER's title, so the scenes that reuse that session find this one.
import {
  ROUTER,
  archiveSessions,
  ensureStarted,
  followTurn,
  hoverLast,
  newSession,
  sendChat,
  sleep,
} from "../lib/ui.mjs";

const PROMPT =
  "Add a delete() helper to Router next to get() and post(), with a test in test/router.test.ts. " +
  "Then run npm test, and reply with a Markdown table of the tests and whether each passed.";

export const clip = {
  segments: [
    ["typing-0.3", "sent", 2],
    ["sent", "approval-0.2", 4],
    ["approval-0.2", "allowed:last+0.3", 2.5],
    ["allowed:last+0.3", "turn ended", 4],
    ["turn ended", "end", 1.4],
  ],
};

export async function setup(d) {
  await archiveSessions(d, ROUTER.title);
  await newSession(d, ROUTER);
  await ensureStarted(d);
}

export async function run(d, mark) {
  await sleep(800);
  mark("typing");
  await sendChat(d, PROMPT, 14);
  mark("sent");
  await followTurn(d, mark);
  await sleep(1500);
  // Rest on the reply (its hover bar: Copy, time), then on its table (Copy table).
  await hoverLast(d, ".ac-reply .ac-p");
  mark("hover");
  await sleep(1800);
  if (await d.eval(() => !!document.querySelector(".ac-reply table"))) {
    await hoverLast(d, ".ac-reply table td");
    await sleep(2200);
  }
}
