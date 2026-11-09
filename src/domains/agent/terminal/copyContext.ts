import type { Terminal } from "@xterm/xterm";
import { toast } from "@/app/toast";
import { copyPlain } from "@/ipc/clipboard";
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
  try {
    await copyPlain(
      await contextSource(key).then((source) => formatContext(source, body, isSelection))
    );
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
  void copyPlain(term.getSelection()).catch(() => {});
}
