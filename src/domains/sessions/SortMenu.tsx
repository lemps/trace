import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { useHint } from "@/platform/shortcuts";
import { SORT_MODES, type SortMode, sortLabel } from "./sortSessions";

interface SortMenuProps {
  mode: SortMode;
  onPick: (mode: SortMode) => void;
}

// One list's sort, as a quiet trigger naming it and the app's pop menu. Each
// section (and a tab's unsectioned list) has its own, remembered beside the
// sessions (`orderStore`).
export function SortMenu({ mode, onPick }: SortMenuProps) {
  const up = useHint("sessionMoveUp");
  const down = useHint("sessionMoveDown");
  return (
    <PopMenu
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`sl-sort${open ? " open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          title={`Sort this list (${sortLabel(mode)})`}
        >
          <I.Sort size={12} /> {sortLabel(mode)}
        </button>
      )}
      sections={[
        {
          title: "Sort by",
          items: SORT_MODES.map((m) => ({
            id: m.id,
            label: m.label,
            checked: m.id === mode,
            onSelect: () => onPick(m.id),
            title:
              m.id === "manual"
                ? `Drag rows, or ${up} / ${down} on a row, to set the order`
                : undefined,
          })),
        },
      ]}
    />
  );
}
