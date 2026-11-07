// Subagents: live cards in the chat, each with its own tab, opened beside the chat.
import { archiveSessions, ensureStarted, followTurn, newSession, sendChat, sleep } from "../lib/ui.mjs";

export const SORTER = { title: "Review the sorter", repo: "pixelsort" };

export const clip = {
  segments: [
    ["typing-0.2", "sent", 1.7],
    ["sent", "cards", 3],
    ["cards", "beside+0.6", 1.2],
    ["beside+0.6", "turn ended+0.4", 4],
    ["turn ended+0.4", "end", 1],
  ],
};

export async function setup(d) {
  await archiveSessions(d, SORTER.title);
  await newSession(d, SORTER);
  await ensureStarted(d);
}

export async function run(d, mark) {
  await sleep(600);
  mark("typing");
  await sendChat(
    d,
    "Start two subagents in parallel: one explains src/sort.rs in three bullets, the other reviews src/main.rs for bugs. Don't edit anything. Then summarise both.",
    22,
  );
  mark("sent");
  await d.waitFor(() => document.querySelectorAll('button[aria-label="Open beside"]').length >= 2, 120000);
  mark("cards");
  await sleep(4000);
  await d.click('button[aria-label="Open beside"]');
  mark("beside");
  await followTurn(d, mark);
  await sleep(2500);
}
