// Split panes: chat | Files over Terminal, arranged from each pane's menu.
import { ROUTER, ensureSession, ideLayout, resetPanes, sleep } from "../lib/ui.mjs";

export const clip = {
  segments: [
    ["start+0.5", "npm test", 1.4],
    ["npm test", "end", 1.2],
  ],
};

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await resetPanes(d);
}

export async function run(d, mark) {
  await sleep(1000);
  mark("layout");
  await ideLayout(d);
  await d.click(".xterm");
  await sleep(300);
  await d.type("npm test\n", 70);
  mark("npm test");
  await sleep(3500);
  await d.click("*", "router.test.ts");
  await sleep(3000);
}
