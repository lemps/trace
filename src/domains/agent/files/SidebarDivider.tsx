import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, useSidebarWidth } from "./store";

/** How far one arrow press moves the divider (Shift: further). */
const STEP = 16;
const BIG_STEP = 64;

// The line between the Files sidebar and the viewer, and the handle that resizes the
// sidebar: drag it, use the arrow keys on it, or double-click to put it back. At rest
// it is the same faint 1px rule as every other divider; it lights up while in use.
export function SidebarDivider() {
  const width = useSidebarWidth((s) => s.width);
  const { setWidth, save } = useSidebarWidth.getState();
  const drag = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width };
    document.body.classList.add("fx-resizing");
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) setWidth(d.w + e.clientX - d.x);
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove("fx-resizing");
    save();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const by = e.shiftKey ? BIG_STEP : STEP;
    const targets: Record<string, number> = {
      ArrowLeft: width - by,
      ArrowRight: width + by,
      Home: SIDEBAR_MIN,
      End: SIDEBAR_MAX,
      Enter: SIDEBAR_DEFAULT,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setWidth(next);
    save();
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, draggable splitter — <hr> can't take focus or keys
    <div
      className="fx-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the file list"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => {
        setWidth(SIDEBAR_DEFAULT);
        save();
      }}
      onKeyDown={onKeyDown}
    />
  );
}
