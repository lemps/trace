// Terminal extras: find in the scrollback, the menu on file paths, Copy Context.
// (The clip only points at Copy Context and Copy path: clicking them would
// overwrite the recording machine's clipboard.)
import { ROUTER, ensureSession, resetPanes, sleep, termPoint } from "../lib/ui.mjs";

export const clip = { segments: [["start+0.4", "end", 1.1]] };

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await resetPanes(d);
  await d.click('button[aria-label="Terminal"]');
  await sleep(800);
  if (await d.eval(() => document.body.innerText.includes("Open terminal"))) await d.click("button", "Open terminal");
  await sleep(2500);
  await d.click(".xterm");
  await d.type(process.platform === "win32" ? "cls\n" : "clear\n", 5);
  await sleep(800);
}

export async function run(d, mark) {
  await sleep(800);
  await d.click(".xterm");
  await d.type("git status\n", 70);
  await sleep(1800);
  const p = await termPoint(d, "src/router.ts");
  await d.mouse(p.x, p.y, { button: "right" });
  mark("menu");
  await sleep(1500);
  await d.hover("[role=menuitem], button", "Copy path");
  await sleep(900);
  await d.hover("[role=menuitem], button", "Copy context");
  await sleep(1500);
  await d.click("[role=menuitem], button", "Find");
  mark("find");
  await sleep(700);
  await d.type("router", 110);
  await sleep(1000);
  await d.key("Enter");
  await sleep(1200);
  await d.key("Enter");
  await sleep(2000);
  await d.key("Escape");
  await sleep(800);
}
