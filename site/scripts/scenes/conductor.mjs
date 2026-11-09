// Coming from Conductor: Settings → Repositories → Import from Conductor, the
// preview (repos with their setup, a live workspace, saved prompts), the import
// and its summary.
//
// Needs the fake Conductor install: run `demo-setup.mjs --conductor` before each
// take (the import moves its workspace and adds its repos), and record with
// TRACE_DEV_CONDUCTOR_DIR=<work>/conductor. The button only shows when trace finds
// a Conductor database.
import { sleep } from "../lib/ui.mjs";

export const clip = {
  segments: [
    ["start+0.3", "preview", 1.2],
    ["preview", "import", 1.5],
    ["import", "end", 1.2],
  ],
};

export async function setup(d) {
  await d.click('button[aria-label="Settings"]');
  await sleep(600);
  await d.click("main button", "Repositories");
  await sleep(1200);
  // Fails here when no Conductor database was found (see above).
  await d.center("main button", "Import from Conductor");
}

/** Scroll the dialog's body by `dy`, in a few steps so it reads as a scroll. */
async function scroll(d, dy) {
  const p = await d.center(".ci-preview");
  for (let i = 0; i < 4; i++) {
    await d.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: p.x, y: p.y, deltaX: 0, deltaY: dy / 4 });
    await sleep(160);
  }
}

export async function run(d, mark) {
  await sleep(900);
  await d.click("main button", "Import from Conductor");
  await sleep(1800);
  await d.click("[role=dialog] button", "Conductor is closed");
  await d.waitFor(() => !!document.querySelector(".ci-preview"), 30000);
  mark("preview");
  await sleep(2600);
  await scroll(d, 320);
  await sleep(2200);
  await scroll(d, 420);
  await sleep(2200);
  await scroll(d, 600);
  await sleep(1800);
  await d.click("[role=dialog] button", "Import ");
  mark("import");
  await d.waitFor(
    () => [...document.querySelectorAll("[role=dialog] button")].some((b) => b.innerText.trim() === "Done"),
    60000,
  );
  await sleep(4500);
  mark("summary");
}
