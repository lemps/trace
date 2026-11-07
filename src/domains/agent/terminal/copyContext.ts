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
  // The header needs an IPC round trip, but WebKit only lets the clipboard be written
  // inside the key press or click: hand it a promise now, so the write starts in time.
  const text = contextSource(key).then((source) => formatContext(source, body, isSelection));
  try {
    if (typeof ClipboardItem === "undefined") {
      await navigator.clipboard.writeText(await text);
    } else {
      const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    }
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
