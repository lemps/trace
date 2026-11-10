import { Base, type IconProps } from "./iconBase";

// Code, files and git (the workspace tabs, PRs, epics), part of `I` (Icon.tsx).

export const CODE_ICONS = {
  /** The Files tab, code. Not "Open in…" (External) or a PR's files (FileDiff). */
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
  /** A pull request (the rail's Pull requests page too). */
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
  /** Merge a PR, or a merged one. */
  GitMerge: (p: IconProps) => (
    <Base {...p}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </Base>
  ),
  /** A branch or a worktree. */
  Branch: (p: IconProps) => (
    <Base {...p}>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Base>
  ),
  /** An epic: the stack of tickets it groups. */
  Layers: (p: IconProps) => (
    <Base {...p}>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
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
  /** A PR's diff on GitHub. */
  FileDiff: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M9 10h6" />
      <path d="M12 13V7" />
      <path d="M9 17h6" />
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
  /** A task list (an agent's todos). */
  ListChecks: (p: IconProps) => (
    <Base {...p}>
      <path d="m3 17 2 2 4-4" />
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </Base>
  ),
  /** A tool call of any other kind (a chat tool card, a transcript tool row). Not `Code`. */
  Wrench: (p: IconProps) => (
    <Base {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Base>
  ),
};
