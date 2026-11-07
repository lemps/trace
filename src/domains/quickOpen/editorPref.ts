import { EDITORS } from "@/domains/agent/editorItems";
import type { Editor } from "@/ipc/editor";

// Which editor Quick Open's "open in editor" uses — the last one picked there.

const KEY = "trace.quickOpenEditor";

export function preferredEditor(): Editor {
  try {
    const saved = localStorage.getItem(KEY);
    return EDITORS.find((e) => e.id === saved)?.id ?? "vscode";
  } catch {
    return "vscode";
  }
}

export function setPreferredEditor(editor: Editor): void {
  try {
    localStorage.setItem(KEY, editor);
  } catch {
    // Storage can be unavailable; the choice then lasts until the picker closes.
  }
}
