import { firstLine, oneLine } from "@/domains/orchestrator/oneLine";

// The buddy's voice: one short line from Haiku, through the Assistant's shared
// transport (`orchestrator/oneLine`). No key and no CLI → the buddy stays quiet.

const MAX_CHARS = 140;

/** Who's talking: the chosen character's manifest name and personality. */
export interface Voice {
  name: string;
  personality?: string;
}

const DEFAULT_PERSONALITY = "Warm, playful and a little cheeky.";

/** The system prompt, in the character's voice. */
const persona = ({
  name,
  personality,
}: Voice) => `You are ${name}, a small illustrated character who lives in the corner of "trace", a desktop app where a developer runs several AI coding agents in parallel, one per Kanban ticket. You watch what happens and react in a small speech bubble.

Your personality — stay in character: ${personality?.trim() || DEFAULT_PERSONALITY}

Rules:
- Reply with ONE line of at most 14 words. Plain text: no quotes, no markdown, at most one emoji.
- You're a buddy, not an assistant. Don't offer help or give instructions.
- If an agent needs the user or something failed, say that plainly first and name the ticket.
- Only mention things in the events or board status you're given. Never invent details.
- Vary your phrasing; never repeat a recent line.`;

/** Normalise a model reply to one bubble-sized line (or null if empty). */
export function toBubbleLine(raw: string): string | null {
  return firstLine(raw, MAX_CHARS);
}

/** One line for the bubble, or null when there's no transport or the call fails. */
export function speak(prompt: string, voice: Voice): Promise<string | null> {
  return oneLine(persona(voice), prompt, MAX_CHARS);
}
