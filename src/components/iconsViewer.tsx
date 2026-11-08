import { Base, type IconProps } from "./iconBase";

// The Browser and Gallery tabs' glyphs, and the panes' (a sidebar's pin), part of
// `I` (Icon.tsx).

export const VIEWER_ICONS = {
  /** Keep a sidebar open (AutoSidebar). */
  Pin: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Base>
  ),
  /** The Browser tab. */
  Globe: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Base>
  ),
  /** Open outside trace (external-link): in the browser, on GitHub, in an editor. */
  External: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Base>
  ),
  /** The Gallery tab (images). */
  Images: (p: IconProps) => (
    <Base {...p}>
      <path d="M18 22H4a2 2 0 0 1-2-2V6" />
      <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />
      <circle cx="12" cy="8" r="2" />
      <rect width="16" height="16" x="6" y="2" rx="2" />
    </Base>
  ),
  /** One image at a time (the Gallery viewer's single mode). */
  Square: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </Base>
  ),
  /** Two images side by side (columns). */
  Compare: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
    </Base>
  ),
  /** Swipe between two images. */
  MoveHorizontal: (p: IconProps) => (
    <Base {...p}>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </Base>
  ),
};
