import { Base, type IconProps } from "./iconBase";

// The Browser and Gallery tabs' glyphs, part of `I` (Icon.tsx), kept here so that
// file stays under the size cap.

export const VIEWER_ICONS = {
  /** The Browser tab. */
  Globe: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </Base>
  ),
  Forward: (p: IconProps) => (
    <Base {...p}>
      <path d="m9 18 6-6-6-6" />
    </Base>
  ),
  /** Open outside trace (external-link). */
  External: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Base>
  ),
  Stop: (p: IconProps) => (
    <Base {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
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
  /** Two images side by side (columns). */
  Compare: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 3v18" />
    </Base>
  ),
};
