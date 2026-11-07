import { sendAgentInput } from "@/ipc/agent";

// Typing a message into an agent's terminal and submitting it.
//
// Sent as one write, `text\r` arrives as a single burst. Claude Code reads a long
// burst as a paste, so the Enter at its end lands as a newline inside the prompt
// and the message sits there unsent; short ones happened to work. Sending Enter on
// its own, once the text has landed, is a real key press whatever the length.

/** Time for the TUI to take the text in before Enter arrives. */
const ENTER_DELAY_MS = 250;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Type `text` into the agent's terminal, then press Enter. */
export async function submitLine(workspaceId: string, text: string): Promise<void> {
  await sendAgentInput(workspaceId, text);
  await pause(ENTER_DELAY_MS);
  await sendAgentInput(workspaceId, "\r");
}
