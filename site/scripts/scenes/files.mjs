// Files and Quick Open: the worktree's tree and changes, and a fuzzy file search.
import { ROUTER, ensureSession, openSidebar, resetPanes, sleep } from "../lib/ui.mjs";

export const clip = { segments: [["start+0.4", "end", 1.1]] };

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await resetPanes(d);
}

export async function run(d, mark) {
  await sleep(1000);
  await d.click('button[aria-label="Files"]');
  await sleep(1500);
  // The list is folded beside the viewer; resting on its strip slides it out.
  await openSidebar(d);
  mark("list");
  await sleep(700);
  await d.click(".detail aside.as button", "All files");
  mark("all files");
  await sleep(1500);
  await d.click(".detail aside.as *", "src");
  await sleep(1200);
  await d.click(".detail aside.as *", "path.ts");
  await sleep(1800);
  // Quick Open: Ctrl+Shift+P here (⌘P on macOS).
  await d.key("p", process.platform === "darwin" ? 4 : 2 | 8);
  mark("quick open");
  await sleep(900);
  await d.type("rtest", 140);
  await sleep(1200);
  await d.key("Enter");
  mark("opened");
  // Off the list, so it folds away and the diff shows in full.
  await d.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900, y: 420 });
  await sleep(3000);
}
