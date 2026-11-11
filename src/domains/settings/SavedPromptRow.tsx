import { useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { ConfirmPrompt } from "@/components/InlineConfirm";
import { RowBar, RowMenuPopover } from "@/components/RowMenu";
import { barActions, type RowActionSection, useRowMenu } from "@/components/useRowMenu";
import { useSavedPrompts } from "@/domains/savedPrompts/store";
import type { SavedPrompt } from "@/ipc/savedPrompts";

interface SavedPromptRowProps {
  prompt: SavedPrompt;
  onEdit: () => void;
}

// One saved prompt in Settings: its /name, title and the start of its text. Its
// actions are one list (trace-ui §5): Edit in the hover bar, everything behind the
// ⋯ and right-click. Delete asks in the row first, at the row's xs tier.
export function SavedPromptRow({ prompt, onEdit }: SavedPromptRowProps) {
  const menu = useRowMenu();
  const [confirming, setConfirming] = useState(false);

  const remove = async () => {
    try {
      await useSavedPrompts.getState().remove(prompt.id);
    } catch (err) {
      toast.error(`Couldn't delete /${prompt.name}: ${String(err)}`);
    }
  };

  const actions: RowActionSection[] = [
    { items: [{ id: "edit", label: "Edit", glyph: I.Pencil, inBar: true, onSelect: onEdit }] },
    {
      items: [{ id: "delete", label: "Delete", danger: true, onSelect: () => setConfirming(true) }],
    },
  ];

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: right-click and double-click are shortcuts; the ⋯ and Edit are the buttons */}
      <div
        className={`sp-row${menu.at ? " menu-open" : ""}`}
        onContextMenu={confirming ? undefined : menu.onContextMenu}
        onDoubleClick={confirming ? undefined : onEdit}
      >
        <span className="sp-row-name">/{prompt.name}</span>
        <span className="sp-row-text">
          <span className="sp-row-title">{prompt.title}</span>
          <span className="sp-row-body" title={prompt.body}>
            {prompt.body}
          </span>
        </span>
        {confirming ? (
          <ConfirmPrompt
            size="xs"
            message={`Delete /${prompt.name}?`}
            confirmLabel="Delete"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              void remove();
            }}
          />
        ) : (
          <RowBar
            className="sp-actions"
            actions={barActions(actions)}
            menu={menu}
            moreLabel={`/${prompt.name} actions`}
          />
        )}
      </div>
      <RowMenuPopover menu={menu} sections={actions} />
    </>
  );
}
