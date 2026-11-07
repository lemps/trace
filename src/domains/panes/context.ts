import { createContext, useContext } from "react";
import type { Panes } from "./usePanes";

/** What every pane in one pane area shares. */
export interface PaneArea {
  panes: Panes;
  /** Too small for the arrangement: one tab row, arranging switched off. */
  narrow: boolean;
  /** More than one pane is showing. */
  multi: boolean;
  /** The element a shown tab's content is portalled into (see PanelSlot). */
  elementFor: (tab: string) => HTMLElement;
  /** Move keyboard focus into the focused pane once the layout has rendered. */
  focusLater: () => void;
}

export const PaneAreaContext = createContext<PaneArea | null>(null);

export function usePaneArea(): PaneArea {
  const area = useContext(PaneAreaContext);
  if (!area) throw new Error("usePaneArea outside a PaneArea");
  return area;
}
