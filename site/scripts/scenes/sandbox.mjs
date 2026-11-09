// A session in a Vercel Sandbox: the Vercel dialog's checklist, a new session set to
// run on Vercel in the public noble1911/trace repo, and a read-only question
// answered from inside the sandbox.
//
// Needs real accounts, unlike the other scenes: a Vercel token, a Claude login for
// sandboxes and a GitHub sign-in in the demo config (copied in for the take, then
// removed), and a clone of noble1911/trace in the demo's repos. Delete the session
// in trace afterwards, which deletes its sandbox snapshot.
import { archiveSessions, followTurn, pick, rail, sendChat, shown, sleep } from "../lib/ui.mjs";

const TITLE = "Explain the recorder";
const PROMPT =
  "Read site/README.md and say in two sentences what the site recorder does. Don't edit anything.";

export const clip = {
  segments: [
    ["start+0.3", "created", 1.3],
    ["created", "ready", 12],
    ["ready", "sent", 1.6],
    ["sent", "turn ended", 5],
    ["turn ended", "end", 1.2],
  ],
};

const ready = (d) =>
  d.eval(() => {
    const t = document.querySelector("textarea.ac-input");
    return !!t && !t.disabled && !document.body.innerText.includes("The agent isn't running");
  });

export async function setup(d) {
  // Hide the account's other sandbox sessions: they aren't demo data.
  await d.eval(() => {
    const st = document.createElement("style");
    st.textContent = ".vs-group{display:none!important}";
    document.head.append(st);
  });
  await archiveSessions(d, TITLE);
  await rail(d, "Sessions");
}

export async function run(d, mark) {
  // What a sandbox session needs: every row of the checklist ticked.
  await rail(d, "Integrations");
  await sleep(900);
  await d.click(".ig-card .ig-name", "Vercel");
  await sleep(3200);
  await d.key("Escape");
  await sleep(500);

  await rail(d, "Sessions");
  await d.click("button", "New session");
  await sleep(700);
  await d.click("[role=dialog] input");
  await d.type(TITLE, 40);
  await sleep(300);
  await d.click('[role=dialog] fieldset[aria-label="Run on"] button', "Vercel");
  await sleep(1500);
  await pick(d, "[role=dialog]", "trace");
  await sleep(1200);
  await d.click("[role=dialog] button", "Create");
  await d.waitFor(() => !document.querySelector("[role=dialog]"), 30000);
  mark("created");

  // The sandbox boots and clones the repo; Start if the agent isn't running yet.
  for (let i = 0; i < 300 && !(await ready(d)); i++) {
    if (await d.eval(() => document.body.innerText.includes("The agent isn't running"))) {
      if (await shown(d, "button")) await d.click("button", "Start").catch(() => {});
      await sleep(3000);
    }
    await sleep(1000);
  }
  if (!(await ready(d))) throw new Error("the sandbox session never became ready");
  // Details reads the sandbox's state once a minute, and its first read can come
  // before the sandbox exists; a window focus makes it read again now.
  await d.eval(() => window.dispatchEvent(new Event("focus")));
  await sleep(1200);
  mark("ready");

  await sendChat(d, PROMPT, 26);
  mark("sent");
  await followTurn(d, mark);
  await d.eval(() => window.dispatchEvent(new Event("focus")));
  await sleep(2500);
}
