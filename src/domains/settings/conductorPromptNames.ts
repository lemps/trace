// Conductor's custom prompts in the import preview: what each kind is called,
// and whether the names about to be saved are ones trace will take. Pure, so
// it's tested without a renderer. The backend checks again when it saves.

import type { ConductorPreview, ConductorPromptKind } from "../../ipc/conductorImport.ts";
import type { Ticks } from "./conductorSelection.ts";

/** What Conductor called each kind. */
export const PROMPT_KIND_LABEL: Record<ConductorPromptKind, string> = {
  general: "General",
  createPr: "Create PR",
  codeReview: "Code review",
  fixErrors: "Fix errors",
  mergeConflicts: "Merge conflicts",
  renameBranch: "Rename branch",
};

/** `saved_prompts::MAX_NAME`. */
const MAX_NAME = 40;

/** A name as typed (`/Review-PR `) as its slug (`review-pr`), as the backend cleans it. */
export function cleanPromptName(name: string): string {
  return name.trim().replace(/^\/+/, "").toLowerCase();
}

/** Why `name` can't be a saved prompt's name, or null when it can. */
export function nameProblem(name: string): string | null {
  const slug = cleanPromptName(name);
  if (!slug) return "Give it a name to type after /.";
  if (slug.length > MAX_NAME) return `Keep the name to ${MAX_NAME} characters.`;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    return "Use letters, digits, - and _, starting with a letter or digit.";
  }
  return null;
}

/** The name a prompt will be saved under: as edited, or as proposed. */
export function promptName(key: string, proposed: string, ticks: Ticks): string {
  return ticks.promptNames[key] ?? proposed;
}

/**
 * A problem for each ticked prompt whose name won't save: not a valid name,
 * one trace already has, or one two ticked prompts share. Keyed by prompt key.
 */
export function promptProblems(preview: ConductorPreview, ticks: Ticks): Record<string, string> {
  const ticked = preview.prompts.filter((p) => !p.existing && ticks.prompts.has(p.key));
  const slugs = ticked.map((p) => cleanPromptName(promptName(p.key, p.name, ticks)));
  const problems: Record<string, string> = {};
  ticked.forEach((p, i) => {
    const slug = slugs[i] ?? "";
    const problem =
      nameProblem(slug) ??
      (preview.savedPromptNames.includes(slug) ? `trace already has /${slug}.` : null) ??
      (slugs.indexOf(slug) !== slugs.lastIndexOf(slug)
        ? `Another prompt here is called /${slug}.`
        : null);
    if (problem) problems[p.key] = problem;
  });
  return problems;
}

/** Whether a body is long enough to clamp in the preview. */
export function isLongBody(body: string): boolean {
  return body.length > 240 || body.split("\n").length > 3;
}
