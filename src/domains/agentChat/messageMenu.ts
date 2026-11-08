import { toast } from "@/app/toast";
import type { MenuSection } from "@/components/PopMenu";
import { useComposerFill } from "./composerFill";
import { plainText } from "./messageText";

// What can be done with a chat message. The hover bar shows the frequent ones (Copy,
// and Edit on yours); its right-click menu lists them all, from here, so the two
// can't drift (trace-ui §2 rule 6).

/** Copy `text`, saying so: the menu has no check mark to flash. */
export function copyMessage(text: string, done = "Copied"): void {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(done),
    () => toast.error("Couldn't copy to the clipboard")
  );
}

/** Put a copy of `text` in the workspace's composer to change and send again. */
export function editInComposer(workspaceId: string, text: string): void {
  useComposerFill.getState().fill(workspaceId, text);
}

interface MessageMenuArgs {
  /** The message's Markdown. */
  text: string;
  /** Set on your own messages: Edit in composer. */
  edit?: () => void;
  /** Text selected inside the message when it was right-clicked. */
  selection?: string;
}

/** A message's right-click menu: the hover bar's actions, plus the plain-text copies. */
export function messageMenu({ text, edit, selection }: MessageMenuArgs): MenuSection[] {
  return [
    {
      items: [
        ...(selection ? [{ label: "Copy selection", onSelect: () => copyMessage(selection) }] : []),
        { label: "Copy", onSelect: () => copyMessage(text) },
        { label: "Copy as plain text", onSelect: () => copyMessage(plainText(text)) },
      ],
    },
    { items: edit ? [{ label: "Edit in composer", onSelect: edit }] : [] },
  ];
}
