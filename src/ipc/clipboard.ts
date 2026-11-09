import { writeHtml, writeText } from "@tauri-apps/plugin-clipboard-manager";

// The system clipboard, written by the backend (tauri-plugin-clipboard-manager)
// rather than WebKit's `navigator.clipboard`. WebKit refuses a write that isn't
// made inside the click or key press that asked for it (one `await` first is
// enough to lose it), so copies failed now and then with nothing to show why.
// Every copy in trace goes through here. Write-only: the renderer is never
// allowed to read the clipboard.

/** Put plain `text` on the clipboard. */
export function copyPlain(text: string): Promise<void> {
  return writeText(text);
}

/**
 * Put `html` on the clipboard for apps that paste formatting (docs, mail, Slack),
 * with `text` beside it for the ones that don't (editors, terminals).
 */
export function copyRich(html: string, text: string): Promise<void> {
  return writeHtml(html, text);
}
