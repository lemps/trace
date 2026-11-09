// The Plan tab: the agent publishes a plan (trace's publish_document tool), the tab
// appears with a dot, and the document reads like a page beside the chat.
// Starts a fresh Claude chat session in the tinyroute demo repo each take.
import {
  archiveSessions,
  ensureStarted,
  followTurn,
  newSession,
  openSidebar,
  sendChat,
  sleep,
} from "../lib/ui.mjs";

const SESSION = { title: "Router: plan middleware", repo: "tinyroute" };
const PROMPT =
  "Don't change any files. Use trace's publish_document tool to publish a short plan titled " +
  '"Middleware for Router": the goal, the use() API with an example, three implementation ' +
  "steps, and the tests to add. Markdown, under 40 lines.";

export const clip = {
  segments: [
    ["typing-0.3", "sent", 2.5],
    ["sent", "published", 8],
    ["published", "end", 1.9],
  ],
};

export async function setup(d) {
  await archiveSessions(d, SESSION.title);
  await newSession(d, SESSION);
  await ensureStarted(d);
}

export async function run(d, mark) {
  await sleep(800);
  mark("typing");
  await sendChat(d, PROMPT);
  mark("sent");
  await followTurn(d, () => {});
  // The tab comes when there's a plan to show, with a dot until it's read.
  await d.waitFor(() => !!document.querySelector('button[aria-label="Plan"]'), 60000);
  mark("published");
  await sleep(1200);
  await d.click('button[aria-label="Plan"]');
  await sleep(2500);
  // Down the document, then the list of plans sliding out from its strip.
  const doc = await d.center(".pl-main");
  for (let i = 0; i < 4; i++) {
    await d.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: doc.x, y: doc.y, deltaX: 0, deltaY: 260 });
    await sleep(700);
  }
  await sleep(800);
  await openSidebar(d);
  await sleep(1800);
  await d.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: doc.x, y: doc.y });
  await sleep(1500);
}
