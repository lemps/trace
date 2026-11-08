import { ACTION_ICONS } from "./iconsActions";
import { CODE_ICONS } from "./iconsCode";
import { NAV_ICONS } from "./iconsNav";
import { VIEWER_ICONS } from "./iconsViewer";

// trace's one icon set: minimal Lucide-style stroked glyphs in a 24-unit frame
// (`iconBase.tsx`), first ported from the design's icons.jsx. Drawn by family in the
// `icons*.tsx` files beside this one; `I` is the only way in. One meaning per glyph:
// the glyph table lives in the trace-ui skill.

export type { IconProps } from "./iconBase";
export { ICON_SIZE, type IconSize } from "./iconScale";

export const I = {
  ...NAV_ICONS,
  ...ACTION_ICONS,
  ...CODE_ICONS,
  ...VIEWER_ICONS,
};
