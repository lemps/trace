// Sessions and worktrees: each agent in its own git worktree, sorted and ordered,
// with who started each one (you, another agent, the orchestrator or a schedule).
import { ROUTER, ensureSession, ensureStarted, followTurn, rail, sendChat, sleep } from "../lib/ui.mjs";
import { SORTER } from "./subagents.mjs";

const CHILD = "Where units go";

export const clip = { segments: [["start+0.4", "end", 1.3]] };

const listed = (d, title) =>
  d.eval((t) => [...document.querySelectorAll("main *")].some((e) => e.children.length === 0 && e.textContent.trim() === t), title);

export async function setup(d) {
  await ensureSession(d, ROUTER);
  await ensureSession(d, { ...SORTER, seed: "Explain src/sort.rs in two sentences. Don't edit anything." });
  await rail(d, "Sessions");
  if (!(await listed(d, CHILD))) {
    // An agent starts a session of its own through trace's start_session tool.
    await ensureSession(d, ROUTER);
    await ensureStarted(d);
    await sendChat(
      d,
      `Use trace's start_session tool to start a session in the weatherline repo titled "${CHILD}", with the prompt "Read weatherline/cli.py and say in one line where a --units flag would go. Don't edit anything." Don't wait for it.`,
      2,
    );
    await followTurn(d, () => {}, { readMs: 300 });
    await rail(d, "Sessions");
    await d.waitFor(
      (t) => [...document.querySelectorAll("main .sr-title")].some((e) => e.textContent.trim() === t),
      30000,
      CHILD,
    );
  }
  // Start from the manual order.
  await d.click("main button[title^='Sort this list']");
  await sleep(400);
  await d.click("[role=menuitem], [role=menuitemradio]", "Manual");
  await sleep(800);
}

const sortBy = async (d, label) => {
  await d.click("main button[title^='Sort this list']");
  await sleep(900);
  await d.click("[role=menuitem], [role=menuitemradio]", label);
  await sleep(2200);
};

export async function run(d, mark) {
  await sleep(1500);
  await sortBy(d, "Started by");
  mark("by creator");
  await sortBy(d, "Status");
  await sortBy(d, "Manual");
  await d.hover("main *", CHILD);
  await sleep(1200);
  await d.click("main *", CHILD);
  mark("opened");
  await sleep(3500);
}
