// Board and ticket agents. A still of the Integrations page: the demo has no
// tracker, and the page doesn't show made-up ticket data.
import { rail, sleep } from "../lib/ui.mjs";

export const clip = { kind: "still" };

export async function setup(d) {
  await rail(d, "Integrations");
  await sleep(800);
}
