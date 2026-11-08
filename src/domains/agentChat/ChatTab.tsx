import type { MouseEvent, ReactNode } from "react";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { fitClass, type TabFitMode } from "@/components/useTabFit";

interface ChatTabProps {
  id: string;
  /** Its full name, for screen readers whether or not the label shows. */
  name: string;
  mode: TabFitMode;
  active: string;
  onPick: (tab: string) => void;
  title: string;
  /** The shortcut that picks it from here (`aria-keyshortcuts`). */
  ariaKeys?: string;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
  /** Set when the tab can close: a × beside it, and middle-click. */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * One tab of a chat's strip (`ChatTabs`). Its × keeps its slot, transparent until
 * the tab is hovered or focused, so labels never shift (trace-ui §2 rule 1).
 */
export function ChatTab({
  id,
  name,
  mode,
  active,
  onPick,
  title,
  ariaKeys,
  onContextMenu,
  onClose,
  children,
}: ChatTabProps) {
  const on = id === active;
  const out = mode === "out";
  return (
    <>
      <button
        type="button"
        role="tab"
        data-fit-tab={id}
        aria-selected={on}
        aria-label={name}
        aria-keyshortcuts={ariaKeys}
        aria-hidden={out || undefined}
        tabIndex={out ? -1 : undefined}
        className={`ac-tab${on ? " on" : ""}${fitClass(mode)}`}
        onClick={() => onPick(id)}
        onAuxClick={(e) => {
          if (e.button !== 1 || !onClose) return;
          e.preventDefault();
          onClose();
        }}
        onContextMenu={onContextMenu}
        title={title}
      >
        {children}
      </button>
      {onClose && (
        <IconButton
          size="xs"
          className={`ghost ac-tab-close${fitClass(mode)}`}
          data-fit-of={id}
          tabIndex={out ? -1 : undefined}
          aria-hidden={out || undefined}
          label={`Close ${name}`}
          onClick={onClose}
          onContextMenu={onContextMenu}
        >
          <I.X size={12} />
        </IconButton>
      )}
    </>
  );
}
