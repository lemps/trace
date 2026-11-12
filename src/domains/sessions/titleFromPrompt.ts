import { oneLine } from "@/domains/orchestrator/oneLine";
import { cleanTitle, MAX_TITLE, titleFromText } from "./sessionTitle";

// A new session's name, from the task its user typed. The dialog is prompt-first,
// so nobody types a title: Haiku writes one, and the task's own first line stands in
// when there's no transport for it, it declines, or it takes too long.
//
// The name is chosen before the session is created, not patched in afterwards: a
// folder session slugifies its title into its folder name at creation
// (`commands/session_folder.rs`), and renaming later doesn't move the folder.

/** Haiku answers in well under a second; past this the prompt's own words do. */
const TIMEOUT_MS = 3000;

const SYSTEM = `You name coding sessions. The user has just written a task for an AI coding agent, and you give that session its name.

Rules:
- Reply with ONLY the name: at most 6 words, no quotes, no trailing period.
- Name the work, not the person: "Fix flaky auth test", never "Help with a test".
- Keep the user's own nouns — file names, ticket keys, library names — where they wrote them.
- Never invent detail the task doesn't give you. A vague task gets a vague name.`;

/** Name a session after `prompt`; its first line when no model answers in time. */
export async function titleFromPrompt(prompt: string): Promise<string> {
  const fallback = titleFromText(prompt);
  if (!fallback) return "";
  const named = await Promise.race([
    oneLine(SYSTEM, prompt, MAX_TITLE),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]);
  return cleanTitle(named) || fallback;
}
