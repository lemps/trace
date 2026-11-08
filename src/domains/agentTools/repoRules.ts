import type { Outcome } from "./confirmQueue.ts";

// The repo tools' rules, apart from the IPC they drive. Pure, so `npm test`
// can load it.

/** GitHub's own rules for an owner and a repo name (`github::clone::parse_full_name` checks again). */
const FULL_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;

export function isFullName(name: string): boolean {
  return FULL_NAME.test(name);
}

/** What the agent is told for each answer. */
export function outcomeText(outcome: Outcome | "timeout", what: string): string {
  if (outcome === "timeout") {
    return `Not done yet: waiting for the user to approve ${what} in trace (or still doing it). Ask again later with the same arguments to get their answer; don't assume it happened.`;
  }
  if (outcome.kind === "denied") return `The user declined ${what}. It wasn't done.`;
  if (outcome.kind === "failed") throw new Error(outcome.text);
  return outcome.text;
}
