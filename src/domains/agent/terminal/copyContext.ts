import type { Terminal } from "@xterm/xterm";
import { toast } from "@/app/toast";
import { CONTEXT_LINES, formatContext, lastLines } from "./contextText";
import { contextSource } from "./source";

/**
 * Copy Context: the selection (or the last `CONTEXT_LINES` lines) with a header
 * naming the agent or shell and the worktree it ran in, ready to paste into
 * another agent, a ticket or a chat.
 */
export async function copyContext(key: string, term: Terminal): Promise<void> {
  const isSelection = term.hasSelection();
  // Read the text now: the selection or screen may change while the header loads.
  const body = isSelection
    ? term.getSelection().trimEnd()
    : lastLines(term.buffer.active, CONTEXT_LINES).join("\n");
  if (body === "") {
    toast.info("Nothing in this terminal to copy yet.");
    return;
  }
  const source = await contextSource(key);
  try {
    await navigator.clipboard.writeText(formatContext(source, body, isSelection));
    toast.success(
      isSelection ? "Copied the selection with context." : "Copied the last lines with context."
    );
  } catch (e) {
    toast.error(`Couldn't copy: ${String(e)}`);
  }
}

/** Copy the terminal's selection as it is. */
export function copySelection(term: Terminal): void {
  if (!term.hasSelection()) return;
  void navigator.clipboard.writeText(term.getSelection()).catch(() => {});
}
