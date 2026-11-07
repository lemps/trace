// Agents as a chat: a prompt, Markdown, tool cards, diffs, approvals answered in place.
// Starts a fresh Claude chat session in the tinyroute demo repo each take.
import { ROUTER, archiveSessions, ensureStarted, followTurn, newSession, sendChat, sleep } from "../lib/ui.mjs";

export const clip = {
  segments: [
    ["typing-0.3", "sent", 1.4],
    ["sent", "approval-0.2", 4],
    ["approval-0.2", "allowed:last+0.3", 1.8],
    ["allowed:last+0.3", "turn ended", 3],
    ["turn ended", "end", 1],
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
  await sendChat(d, ROUTER.seed);
  mark("sent");
  await followTurn(d, mark);
  await sleep(3000);
}
