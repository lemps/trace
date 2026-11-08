import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useLiveStore } from "./store";

// Inbox's and Fleet's one way back from a dragged order: a ghost icon button, shown
// only once rows have been dragged, with the same name in both lists.
export function ResetOrderButton() {
  const manualOrder = useLiveStore((s) => s.manualOrder);
  const resetOrder = useLiveStore((s) => s.resetOrder);
  if (!manualOrder) return null;
  return (
    <IconButton size="sm" className="ghost" label="Reset to opened order" onClick={resetOrder}>
      <I.RotateCcw size={14} />
    </IconButton>
  );
}
