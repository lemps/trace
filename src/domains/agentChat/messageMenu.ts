import { toast } from "@/app/toast";
import type { MenuSection } from "@/components/PopMenu";
import { copyPlain, copyRich } from "@/ipc/clipboard";
import { useComposerFill } from "./composerFill";
import { plainText } from "./messageText";

// What can be done with a chat message. The hover bar shows the frequent ones (Copy,
// and Edit on yours); its right-click menu lists them all, from here, so the two
// can't drift (trace-ui §5, the hover bar).

/** What a copy puts on the clipboard: `text`, and the same formatted when there's `html`. */
export interface Copied {
  text: string;
  html?: string | null;
}

/** Copy, formatted where it can be (docs, mail, Slack), as text everywhere else. */
export function writeCopy({ text, html }: Copied): Promise<void> {
  return html ? copyRich(html, text) : copyPlain(text);
}

/** Copy, saying so: the menu has no check mark to flash. */
export function copyMessage(copied: Copied): void {
  void writeCopy(copied).then(
    () => toast.success("Copied"),
    (e) => toast.error(`Couldn't copy: ${String(e)}`)
  );
}

/** Put a copy of `text` in the workspace's composer to change and send again. */
export function editInComposer(workspaceId: string, text: string): void {
  useComposerFill.getState().fill(workspaceId, text);
}

interface MessageMenuArgs {
  /** The message's Markdown. */
  text: string;
  /** The message as rendered, as HTML (`clipboardHtml.ts`), read when it's copied. */
  html: () => string | null;
  /** Set on your own messages: Edit in composer. */
  edit?: () => void;
  /** What was selected inside the message when it was right-clicked. */
  selection?: Copied;
}

/**
 * A message's right-click menu: the hover bar's actions, plus the plain-text copy.
 * Copy and Copy selection carry the formatting (Markdown as the text beside it).
 */
export function messageMenu({ text, html, edit, selection }: MessageMenuArgs): MenuSection[] {
  return [
    {
      items: [
        ...(selection ? [{ label: "Copy selection", onSelect: () => copyMessage(selection) }] : []),
        { label: "Copy", onSelect: () => copyMessage({ text, html: html() }) },
        { label: "Copy as plain text", onSelect: () => copyMessage({ text: plainText(text) }) },
      ],
    },
    { items: edit ? [{ label: "Edit in composer", onSelect: edit }] : [] },
  ];
}
