import { currentOs } from "./os";

const isWindows = currentOs === "windows";

/** The shell a one-line command (a precheck, a setup step) runs in, by name. */
export const lineShell: string = isWindows ? "cmd" : "sh";

/** A precheck that passes only when CI has a failed run, written for [`lineShell`]. */
export const precheckExample: string = isWindows
  ? "gh run list --status failure --limit 1 | findstr ."
  : "gh run list --status failure --limit 1 | grep -q .";
