import type Anthropic from "@anthropic-ai/sdk";
import { READ_ACTIVITY, runReadActivity } from "./activityTool";
import { GET_SESSION_CHANGES, runGetSessionChanges } from "./changesTool";
import { CONTROL_TOOLS, isControlTool, runControlTool } from "./controlTools";
import { GET_SESSION_PR, runGetSessionPr } from "./prTool";
import { isRepoTool, REPO_TOOLS, runRepoTool } from "./repoTools";

// Sessions an agent supervises (stop, interrupt, their changes and PR), the
// activity log, and repos (confirmed by the user). Kept apart from the
// registry so it only gains one entry for all of them.

export const MORE_TOOLS: Anthropic.Tool[] = [
  ...CONTROL_TOOLS,
  GET_SESSION_CHANGES,
  GET_SESSION_PR,
  READ_ACTIVITY,
  ...REPO_TOOLS,
];

const NAMES = new Set(MORE_TOOLS.map((t) => t.name));

export function isMoreTool(name: string): boolean {
  return NAMES.has(name);
}

/** Run one of these for the agent `caller` (its workspace id). */
export function runMoreTool(name: string, input: unknown, caller: string): Promise<string> {
  if (isControlTool(name)) return runControlTool(name, input, caller);
  if (isRepoTool(name)) return runRepoTool(name, input, caller);
  if (name === GET_SESSION_CHANGES.name) return runGetSessionChanges(input);
  if (name === GET_SESSION_PR.name) return runGetSessionPr(input);
  return runReadActivity(input);
}
