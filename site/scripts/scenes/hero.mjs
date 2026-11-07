// The hero image: an agent's chat beside its changed files, with the tests run below.
import { ROUTER, ensureSession, ideLayout, resetPanes, sleep } from "../lib/ui.mjs";

export const clip = { kind: "still" };

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await resetPanes(d);
  await ideLayout(d, 400);
  await d.click(".xterm");
  await d.type("npm test\n", 5);
  await sleep(3500);
  await d.click("*", "router.ts");
  await sleep(1500);
  // Leave the pointer off the controls.
  await d.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 790 });
}
