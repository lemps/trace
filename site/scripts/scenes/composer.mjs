// The composer: model, effort and mode pickers, a saved prompt from the slash
// menu, a pasted screenshot shown as a thumbnail, and the context ring.
// Needs the demo's saved prompt `repro` (demo-setup.mjs writes saved-prompts.json).
// Starts a fresh Claude chat session in tinyroute each take, seeded with one short
// turn so the context ring has a value.
import { archiveSessions, followTurn, ensureStarted, newSession, sendChat, sleep } from "../lib/ui.mjs";

const SESSION = { title: "Router: composer", repo: "tinyroute" };
const SEED = "Read src/router.ts and say in one line what it exports.";

export const clip = {
  segments: [
    ["start+0.3", "sent+1.2", 1.15],
    ["sent+1.2", "end", 1.6],
  ],
};

/** Open a composer picker (Model, Effort, Mode) and pick `item` from its menu. */
async function choose(d, picker, item) {
  await d.click(`.ac-composer button.ac-opt[aria-label^="${picker}:"]`);
  await sleep(900);
  await d.hover("[role=menu] [role=menuitem]", item);
  await sleep(450);
  await d.click("[role=menu] [role=menuitem]", item);
  await sleep(800);
}

/**
 * Paste a screenshot into the composer. It's drawn on a canvas in the page (a
 * failing request against the demo router), so nothing comes from the machine's
 * clipboard, and dispatched as a paste carrying it as a file.
 */
function pasteShot() {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const g = c.getContext("2d");
  g.fillStyle = "#14161b";
  g.fillRect(0, 0, 640, 360);
  g.fillStyle = "#262a33";
  g.fillRect(0, 0, 640, 34);
  for (const [i, col] of ["#ff5f57", "#febc2e", "#28c840"].entries()) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(20 + i * 20, 17, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.font = "18px Menlo, monospace";
  const lines = [
    ["#9aa4b2", "$ curl -i -X DELETE localhost:3000/items/7"],
    ["#e8e8e8", "HTTP/1.1 404 Not Found"],
    ["#e8e8e8", "content-type: text/plain"],
    ["#e8e8e8", ""],
    ["#ff7b72", "no route for DELETE /items/7"],
    ["#9aa4b2", "$ curl -i localhost:3000/items/7"],
    ["#7ee787", "HTTP/1.1 200 OK"],
  ];
  lines.forEach(([col, text], i) => {
    g.fillStyle = col;
    g.fillText(text, 22, 76 + i * 36);
  });
  return new Promise((done, fail) => {
    c.toBlob((blob) => {
      try {
        const file = new File([blob], "delete-404.png", { type: "image/png" });
        const dt = new DataTransfer();
        dt.items.add(file);
        const box = document.querySelector("textarea.ac-input");
        const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
        // WebKit may drop clipboardData from the constructor; set it if so.
        if (!ev.clipboardData) Object.defineProperty(ev, "clipboardData", { value: dt });
        box.dispatchEvent(ev);
        done(true);
      } catch (e) {
        fail(e);
      }
    }, "image/png");
  });
}

export async function setup(d) {
  await archiveSessions(d, SESSION.title);
  await newSession(d, SESSION);
  await ensureStarted(d);
  await sendChat(d, SEED, 2);
  await followTurn(d, () => {}, { readMs: 300 });
  await sleep(1500);
}

export async function run(d, mark) {
  await sleep(900);
  await choose(d, "Model", "Opus");
  mark("model");
  await choose(d, "Effort", "High");
  await choose(d, "Mode", "Plan");
  await d.click("textarea.ac-input");
  await d.type("/rep", 160);
  mark("slash");
  await sleep(1400);
  await d.key("Enter");
  await sleep(1200);
  await d.eval(pasteShot);
  await d.waitFor(() => !!document.querySelector(".ac-attachment.has-thumb"), 15000);
  mark("pasted");
  await sleep(1800);
  await d.key("Enter");
  mark("sent");
  await sleep(4500);
}
