// Files and Quick Open: the worktree's tree and changes, and a fuzzy file search.
import { ROUTER, ensureSession, resetPanes, sleep } from "../lib/ui.mjs";

export const clip = { segments: [["start+0.4", "end", 1.1]] };

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await resetPanes(d);
}

export async function run(d, mark) {
  await sleep(1000);
  await d.click('button[aria-label="Files"]');
  await sleep(1500);
  await d.click(".detail button", "All files");
  mark("all files");
  await sleep(1500);
  await d.click(".detail *", "src");
  await sleep(1200);
  await d.click(".detail *", "path.ts");
  await sleep(1800);
  // Quick Open: Ctrl+Shift+P here (⌘P on macOS).
  await d.key("p", process.platform === "darwin" ? 4 : 2 | 8);
  mark("quick open");
  await sleep(900);
  await d.type("rtest", 140);
  await sleep(1200);
  await d.key("Enter");
  mark("opened");
  await sleep(3000);
}
