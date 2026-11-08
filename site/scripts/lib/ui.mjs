// Helpers for driving trace's own controls, found by role, label and text.
// Scenes use these to build the demo data they need and to act on screen.
import { sleep } from "./cdp.mjs";

export { sleep };

/** Open a rail page by the start of its label ("Inbox", "Fleet", "Sessions", …). */
export async function rail(d, label) {
  await d.click(`button[aria-label^="${label}"]`);
  // Move off the rail, or its recents flyout slides out over the page.
  await d.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 60 });
  await sleep(700);
}

/** Set the select whose options include `value` (React-safe). */
export async function pick(d, scope, value) {
  await d.eval(
    (sc, v) => {
      const sel = [...document.querySelectorAll(`${sc} select`)].find((s) => [...s.options].some((o) => o.text === v));
      if (!sel) throw new Error(`no select with "${v}"`);
      const opt = [...sel.options].find((o) => o.text === v);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(sel, opt.value);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    },
    scope,
    value,
  );
}

/** Settings → Appearance → a theme ("Dark", "Light", "Midnight", "Paper", "System"). */
export async function setTheme(d, theme) {
  const current = await d.eval(() => document.documentElement.dataset.theme || "");
  if (current.toLowerCase() === theme.toLowerCase()) return;
  await d.click('button[aria-label="Settings"]');
  await sleep(600);
  await d.click("main button", "Appearance");
  await sleep(600);
  await d.click("main button", theme);
  await sleep(800);
}

/** Type into the chat composer and send. */
export async function sendChat(d, text, delay = 28) {
  await d.click("textarea.ac-input");
  await d.type(text, delay);
  await sleep(300);
  await d.key("Enter");
}

/** Whether the Sessions page lists a session with this title. */
async function hasSession(d, title) {
  await sessionsList(d);
  return d.eval((t) => [...document.querySelectorAll("main .sr-title")].some((e) => e.textContent.trim() === t), title);
}

/** The Sessions page's list (from a session's detail, its Back button). */
export async function sessionsList(d) {
  if (await d.eval(() => !!document.querySelector('button[aria-label="Back to Sessions"]'))) {
    await d.click('button[aria-label="Back to Sessions"]');
    await sleep(600);
  }
  await rail(d, "Sessions");
  if (await d.eval(() => !!document.querySelector('button[aria-label="Back to Sessions"]'))) {
    await d.click('button[aria-label="Back to Sessions"]');
    await sleep(600);
  }
}

/** Open a session from the Sessions page. */
export async function openSession(d, title) {
  for (let i = 0; i < 3; i++) {
    const open = () => d.eval((t) => document.querySelector(".detail-top")?.innerText.includes(t) ?? false, title);
    if (await open()) return;
    await sessionsList(d);
    await d.click("main .sr-title", title);
    await sleep(1200);
    if (await open()) return;
  }
  throw new Error(`couldn't open session "${title}"`);
}

/** Archive every session with this title, so a scene can start from a fresh one. */
export async function archiveSessions(d, title) {
  while (await hasSession(d, title)) {
    await openSession(d, title);
    await d.click('.detail-top button[aria-label="Archive session"], button[aria-label="Archive session"]');
    await sleep(600);
    const confirm = await d.eval(() =>
      [...document.querySelectorAll("button")].some((b) => /^(Archive|Confirm)/.test(b.innerText.trim()) && b.offsetParent),
    );
    if (confirm) await d.click("button", "Archive").catch(() => d.click("button", "Confirm"));
    await sleep(1200);
  }
}

/** Create a session from the New session dialog, and leave it open. */
export async function newSession(d, { title, repo, agent = "Claude", shows = "Chat" }) {
  await rail(d, "Sessions");
  await d.click("button", "New session");
  await sleep(500);
  await d.click("[role=dialog] input");
  await d.type(title, 4);
  await pick(d, "[role=dialog]", agent);
  await pick(d, "[role=dialog]", shows);
  await pick(d, "[role=dialog]", repo);
  await sleep(300);
  await d.click("[role=dialog] button", "Create");
  await d.waitFor(() => !document.querySelector("[role=dialog]"), 20000);
  await sleep(1500);
}

/** Start the open session's agent if it isn't running. */
export async function ensureStarted(d) {
  const stopped = await d.eval(() => document.body.innerText.includes("The agent isn't running"));
  if (stopped) {
    await d.click("button", "Start");
    await d.waitFor(() => !document.body.innerText.includes("The agent isn't running"), 60000);
  }
  await sleep(2500);
}

/**
 * Open the session with this title, creating it when missing. With `seed`, a new
 * session is started and sent that prompt, and its turn followed to the end
 * (approvals allowed), so it has a conversation and changes to show.
 */
export async function ensureSession(d, { title, repo, seed }) {
  if (await hasSession(d, title)) {
    await openSession(d, title);
    return false;
  }
  await newSession(d, { title, repo });
  if (seed) {
    await ensureStarted(d);
    await sendChat(d, seed, 2);
    await followTurn(d, () => {}, { readMs: 300 });
  }
  return true;
}

/** The open detail's agent state words ("Working", "Ready", "Permission · Edit", …). */
const stateWords = (d) =>
  d.eval(() => [...document.querySelectorAll(".detail-top span[aria-label]")].map((e) => e.getAttribute("aria-label")).join("|"));

/** Wait until the open session's agent needs you (a question or an approval). */
export const waitNeedsYou = (d, timeout = 180000) =>
  d.waitFor(() => /Needs you|Permission|Question/.test(document.querySelector(".detail-top")?.innerText ?? ""), timeout);

/**
 * Follow the open chat agent until its turn ends, answering each approval with
 * "allow once" after a pause long enough to read it.
 */
export async function followTurn(d, mark, { readMs = 1600, maxMs = 240000, answer = true } = {}) {
  const end = Date.now() + maxMs;
  let sawWork = false;
  while (Date.now() < end) {
    const s = await d.eval(() => ({
      ask: !!document.querySelector(".ac-ask .btn.primary-needs"),
      text: [...document.querySelectorAll(".detail-top span[aria-label]")].map((e) => e.getAttribute("aria-label")).join("|"),
    }));
    const busy = /Working|Needs|Permission|Question/.test(s.text);
    if (busy) sawWork = true;
    if (s.ask && answer) {
      mark("approval");
      await sleep(readMs);
      await d.click(".ac-ask .btn.primary-needs");
      mark("allowed");
      await sleep(400);
      continue;
    }
    if (sawWork && !s.ask && !busy) {
      mark("turn ended");
      return;
    }
    await sleep(250);
  }
  mark("timeout");
}

/** Click the n-th "Pane actions" button (negative counts from the end). */
export async function paneMenu(d, index) {
  const btns = await d.eval(() =>
    [...document.querySelectorAll('button[aria-label="Pane actions"]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  const b = btns[index < 0 ? btns.length + index : index];
  await d.mouse(b.x, b.y);
  await sleep(700);
}

/**
 * Show a tab that comes and goes (Terminal, Tests, Plan, Gallery…): click it if it's
 * in a tab row, else pick it from pane `pane`'s ⋯ → Tabs. Picking Terminal there
 * starts a shell; Tests starts a run.
 */
export async function openTab(d, label, pane = 0) {
  if (await d.eval((l) => !!document.querySelector(`button[aria-label="${l}"]`), label)) {
    await d.click(`button[aria-label="${label}"]`);
  } else {
    await paneMenu(d, pane);
    await d.click("[role=menuitem]", label);
  }
  await sleep(800);
}

/**
 * Slide out a pane's folded list (Files' tree, Plan's documents, Gallery's sets) by
 * resting on its strip. It stays out while the pointer is over it, so click into
 * it next; it's still laid out while folded, so a click without this goes through.
 */
export async function openSidebar(d) {
  if (await d.eval(() => !!document.querySelector(".detail aside.as.pinned"))) return;
  await d.hover(".detail aside.as .as-strip");
  await d.waitFor(() => !!document.querySelector(".detail aside.as.open"));
  await sleep(350);
}

/** Put the open session back to one pane, with any leftover shell ended. */
export async function resetPanes(d) {
  // A shell's tab only hides on ×; `exit` ends the shell, and the tab goes with it.
  if (await d.eval(() => !!document.querySelector('button[aria-label="Terminal"]'))) {
    await d.click('button[aria-label="Terminal"]');
    await sleep(500);
    await d.click(".xterm");
    await d.type("exit\n", 5);
    await sleep(1000);
  }
  if (await d.eval(() => document.querySelectorAll('button[aria-label="Pane actions"]').length > 1)) {
    await paneMenu(d, 0);
    await d.click("[role=menuitem]", "Reset layout");
    await sleep(800);
  }
  await d.click('button[aria-label="claude"]');
  await sleep(1000);
}

/** Arrange chat | Files over Terminal from the panes' menus. */
export async function ideLayout(d, pause = 1000) {
  await d.click('button[aria-label="Files"]');
  await sleep(pause);
  await paneMenu(d, 0);
  await d.click("[role=menuitem]", "Split right");
  await sleep(pause * 1.3);
  // Terminal shows once a shell is open: picking it from the menu starts one.
  await openTab(d, "Terminal", 0);
  await sleep(pause * 0.7);
  await paneMenu(d, 0);
  await d.click("[role=menuitem]", "Move to next pane");
  await sleep(pause);
  await paneMenu(d, -1);
  await d.click("[role=menuitem]", "Split down");
  await sleep(pause);
  await d.click('button[aria-label="claude"]');
  await sleep(pause);
  // The shell started as the tab opened; only a failed start leaves the button.
  if (await d.eval(() => document.body.innerText.includes("Open terminal"))) await d.click("button", "Open terminal");
  await sleep(2500);
}

/** The demo session most clips reuse: a finished change in tinyroute. */
export const ROUTER = {
  title: "Router: add delete()",
  repo: "tinyroute",
  seed: "Add a delete() helper to Router next to get() and post(), with a test in test/router.test.ts. Then run npm test.",
};

/** The centre of `text` in the terminal's visible rows (xterm's DOM renderer). */
export async function termPoint(d, text) {
  return d.waitFor(
    (t) => {
      for (const row of document.querySelectorAll(".xterm-rows > div")) {
        const i = row.textContent.indexOf(t);
        if (i < 0) continue;
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        let seen = 0;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const len = n.textContent.length;
          if (seen + len > i) {
            const range = document.createRange();
            range.setStart(n, i - seen);
            range.setEnd(n, Math.min(len, i - seen + t.length));
            const r = range.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }
          seen += len;
        }
      }
      return null;
    },
    15000,
    text,
  );
}
