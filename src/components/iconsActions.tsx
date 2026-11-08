import { Base, type IconProps } from "./iconBase";

// The verbs (start, stop, close, delete, restore, reset…), part of `I` (Icon.tsx).
// One meaning per glyph, one glyph per meaning: see the glyph table in the trace-ui skill.

export const ACTION_ICONS = {
  /** Start or run: an agent, tests, a scheduled prompt, a preview. Restart too. */
  Play: (p: IconProps) => (
    <Base {...p}>
      <path d="M7 5v14l11-7z" />
    </Base>
  ),
  /** Stop a run or an agent. */
  Stop: (p: IconProps) => (
    <Base {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Base>
  ),
  /** Close or dismiss: reversible. Never delete or stop. Also "failed" in a status. */
  X: (p: IconProps) => (
    <Base {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Base>
  ),
  /** Delete permanently. */
  Trash: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Base>
  ),
  /** Done, passed, copied, selected. Not merge. */
  Check: (p: IconProps) => (
    <Base {...p}>
      <path d="m20 6-11 11-5-5" />
    </Base>
  ),
  /** Reload or re-check. Not restart (Play) or reset (RotateCcw). */
  Refresh: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
      <path d="M21 3v5h-5" />
    </Base>
  ),
  /** Reset to default, undo an order. */
  RotateCcw: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Base>
  ),
  Archive: (p: IconProps) => (
    <Base {...p}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </Base>
  ),
  /** Restore from the archive. */
  ArchiveRestore: (p: IconProps) => (
    <Base {...p}>
      <rect width="20" height="5" x="2" y="3" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h2" />
      <path d="M20 8v11a2 2 0 0 1-2 2h-2" />
      <path d="m9 15 3-3 3 3" />
      <path d="M12 12v9" />
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
  /** Queue a message behind the running turn. */
  ListPlus: (p: IconProps) => (
    <Base {...p}>
      <path d="M11 12H3" />
      <path d="M16 6H3" />
      <path d="M16 18H3" />
      <path d="M18 9v6" />
      <path d="M21 12h-6" />
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
  /** An action the orchestrator proposes. Not Start (that's Play). */
  Bolt: (p: IconProps) => (
    <Base {...p}>
      <path d="M13 2 3 14h8l-1 8 10-12h-8z" />
    </Base>
  ),
  /** Import, download, install. */
  Download: (p: IconProps) => (
    <Base {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </Base>
  ),
  /** Export. */
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
  /** Jump to the newest part of a list (arrow-down). */
  ArrowDown: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </Base>
  ),
  Filter: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 6h18M7 12h10M10 18h4" />
    </Base>
  ),
  /** How a list is sorted (arrow-up-down). */
  Sort: (p: IconProps) => (
    <Base {...p}>
      <path d="m21 16-4 4-4-4M17 20V4M3 8l4-4 4 4M7 4v16" />
    </Base>
  ),
  /** A drag handle on a reorderable row. */
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
};
