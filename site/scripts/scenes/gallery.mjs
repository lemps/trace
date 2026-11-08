// The Gallery tab: the agent makes images and shows them (trace's show_images tool);
// the tab appears, the thumbnails fill in, and one opens full size.
// Starts a fresh Claude chat session in the pixelsort demo repo each take.
import { archiveSessions, ensureStarted, followTurn, newSession, sendChat, sleep } from "../lib/ui.mjs";

const SESSION = { title: "Pixelsort: mode icons", repo: "pixelsort" };
const PROMPT =
  "Make four 64×64 SVG icons for pixelsort's sort modes (hue, brightness, red, random) in " +
  "assets/icons: flat, bold colours, one shape each. Then show the folder to me with trace's " +
  "show_images tool.";

export const clip = {
  segments: [
    ["typing-0.3", "sent", 1.4],
    ["sent", "shown", 4],
    ["shown", "end", 1],
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
  await d.waitFor(() => !!document.querySelector('button[aria-label="Gallery"]'), 60000);
  mark("shown");
  await sleep(1200);
  await d.click('button[aria-label="Gallery"]');
  await d.waitFor(() => document.querySelectorAll(".gl-card").length >= 2, 15000);
  await sleep(2200);
  await d.click(".gl-card");
  await sleep(2000);
  await d.key("ArrowRight");
  await sleep(1400);
  await d.key("ArrowRight");
  await sleep(1400);
  await d.key("Escape");
  await sleep(1500);
}
