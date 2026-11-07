import { currentOs } from "./os";

/**
 * What xterm needs to know about the PTY behind it. On Windows that's ConPTY, which
 * repaints its whole screen from the top after every resize. Told so, xterm grows a
 * terminal by adding blank rows instead of pulling scrollback down into the screen —
 * rows ConPTY's repaint would then overwrite, losing that output for good.
 */
export const ptyCompat: { windowsPty?: { backend: "conpty" } } =
  currentOs === "windows" ? { windowsPty: { backend: "conpty" } } : {};
