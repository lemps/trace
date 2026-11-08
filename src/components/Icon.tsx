import { Base, type IconProps } from "./iconBase";
import { VIEWER_ICONS } from "./iconsViewer";

// Minimal Lucide-style stroked icons, 16x16 by default. Ported from the design's icons.jsx.

export type { IconProps } from "./iconBase";

export const I = {
  Board: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="12" rx="1.5" />
    </Base>
  ),
  Agents: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="8" r="3" />
      <path d="M3 20c0-2.8 2.7-5 6-5s6 2.2 6 5" />
      <path d="M14 20c0-2.8 2.7-5 6-5" />
    </Base>
  ),
  PR: (p: IconProps) => (
    <Base {...p}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="M6 7v10" />
      <path d="M18 11V9a4 4 0 0 0-4-4h-3" />
      <path d="m14 8-3-3 3-3" />
    </Base>
  ),
  Plug: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </Base>
  ),
  Support: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="m4.93 4.93 4.24 4.24" />
      <path d="m14.83 9.17 4.24-4.24" />
      <path d="m14.83 14.83 4.24 4.24" />
      <path d="m9.17 14.83-4.24 4.24" />
    </Base>
  ),
  Refresh: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </Base>
  ),
  Activity: (p: IconProps) => (
    <Base {...p}>
      <path d="M22 12h-4l-3 9-6-18-3 9H2" />
    </Base>
  ),
  Settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Base>
  ),
  Search: (p: IconProps) => (
    <Base {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Base>
  ),
  Plus: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  ),
  Send: (p: IconProps) => (
    <Base {...p}>
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </Base>
  ),
  X: (p: IconProps) => (
    <Base {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  ),
  Sparkles: (p: IconProps) => (
    <Base {...p}>
      <path d="m12 3-1.9 5.6L4.5 10.5l5.6 1.9L12 18l1.9-5.6 5.6-1.9-5.6-1.9z" />
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4" />
    </Base>
  ),
  Chevron: (p: IconProps) => (
    <Base {...p}>
      <path d="m9 18 6-6-6-6" />
    </Base>
  ),
  /** A window with a right-hand panel — the universal "toggle sidebar" glyph. */
  Sidebar: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <path d="M15 4v16" />
    </Base>
  ),
  /** Open beside: a pane split down the middle. */
  SplitRight: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <path d="M12 4v16" />
    </Base>
  ),
  More: (p: IconProps) => (
    <Base {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Base>
  ),
  Back: (p: IconProps) => (
    <Base {...p}>
      <path d="m15 18-6-6 6-6" />
    </Base>
  ),
  Archive: (p: IconProps) => (
    <Base {...p}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </Base>
  ),
  Copy: (p: IconProps) => (
    <Base {...p}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Base>
  ),
  Pencil: (p: IconProps) => (
    <Base {...p}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </Base>
  ),
  Chat: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Base>
  ),
  Code: (p: IconProps) => (
    <Base {...p}>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </Base>
  ),
  Terminal: (p: IconProps) => (
    <Base {...p}>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </Base>
  ),
  Beaker: (p: IconProps) => (
    <Base {...p}>
      <path d="M4.5 3h15" />
      <path d="M6 3v8a6 6 0 0 0 12 0V3" />
      <path d="M6 14h12" />
    </Base>
  ),
  GitPR: (p: IconProps) => (
    <Base {...p}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M6 8v8" />
      <path d="M11 6h4a3 3 0 0 1 3 3v7" />
      <path d="m14 9 3-3-3-3" />
    </Base>
  ),
  Ticket: (p: IconProps) => (
    <Base {...p}>
      <path d="M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 0 0 4v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 0 0-4Z" />
      <path d="M13 5v2M13 17v2M13 11v2" />
    </Base>
  ),
  Check: (p: IconProps) => (
    <Base {...p}>
      <path d="m20 6-11 11-5-5" />
    </Base>
  ),
  Dot3: (p: IconProps) => (
    <Base {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Base>
  ),
  Branch: (p: IconProps) => (
    <Base {...p}>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Base>
  ),
  File: (p: IconProps) => (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Base>
  ),
  /** File-type variants of `File`, for the Files tree: source code, text and docs, images. */
  FileCode: (p: IconProps) => (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m10 13-2 2 2 2" />
      <path d="m14 17 2-2-2-2" />
    </Base>
  ),
  FileText: (p: IconProps) => (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </Base>
  ),
  FileImage: (p: IconProps) => (
    <Base {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <circle cx="10" cy="12" r="2" />
      <path d="m20 17-1.3-1.3a2.4 2.4 0 0 0-3.4 0L9 22" />
    </Base>
  ),
  Folder: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Base>
  ),
  FolderOpen: (p: IconProps) => (
    <Base {...p}>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </Base>
  ),
  /** A clipboard with a checklist: the Plan tab (plans, published documents). */
  Plan: (p: IconProps) => (
    <Base {...p}>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </Base>
  ),
  /** A plain list (the Files tab's flat view of its changes). */
  List: (p: IconProps) => (
    <Base {...p}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Base>
  ),
  /** `Sidebar` mirrored: a panel on the left, for a left-hand pane's hide button. */
  SidebarLeft: (p: IconProps) => (
    <Base {...p}>
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <path d="M9 4v16" />
    </Base>
  ),
  Clock: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  ),
  Filter: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 6h18M7 12h10M10 18h4" />
    </Base>
  ),
  Inbox: (p: IconProps) => (
    <Base {...p}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Base>
  ),
  Fleet: (p: IconProps) => (
    <Base {...p}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </Base>
  ),
  Play: (p: IconProps) => (
    <Base {...p}>
      <path d="M7 5v14l11-7z" />
    </Base>
  ),
  Grip: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </Base>
  ),
  Bolt: (p: IconProps) => (
    <Base {...p}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8z" />
    </Base>
  ),
  Download: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </Base>
  ),
  /** A warning (triangle-alert). */
  Alert: (p: IconProps) => (
    <Base {...p}>
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </Base>
  ),
  /** An agent asking permission to use a tool (shield). */
  Shield: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" />
    </Base>
  ),
  /** Jump to the newest part of a list (arrow-down). */
  ArrowDown: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Base>
  ),
  Upload: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </Base>
  ),
  /** Attach files to a message. */
  Paperclip: (p: IconProps) => (
    <Base {...p}>
      <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </Base>
  ),
  Keyboard: (p: IconProps) => (
    <Base {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </Base>
  ),
  /** How a list is sorted (arrow-up-down). */
  Sort: (p: IconProps) => (
    <Base {...p}>
      <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
    </Base>
  ),
  /** Started by another agent (corner-down-right). */
  StartedBy: (p: IconProps) => (
    <Base {...p}>
      <path d="m15 10 5 5-5 5" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </Base>
  ),
  ...VIEWER_ICONS,
};
