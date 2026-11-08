import { invoke } from "@tauri-apps/api/core";
import type { SetupConfig } from "@/domains/repos/types";

// Settings → Repositories → Import from Conductor (`commands/conductor_import.rs`).
// Conductor's data is only ever read: its database from a private copy.

/** One Conductor repo, with its setup translated into trace's. */
export interface ConductorRepo {
  id: string;
  name: string;
  rootPath: string;
  remoteUrl: string | null;
  /** The checkout is on this computer and is a git repo. */
  exists: boolean;
  /** trace already lists this folder. */
  alreadyAdded: boolean;
  setup: SetupConfig;
  /** What Conductor had that trace doesn't take, each with its reason. */
  notImported: string[];
  /** Translation notes worth reading before importing. */
  notes: string[];
}

export type ConductorWorkspaceStatus = "resumable" | "transcriptMissing" | "folderMissing";

/** One Conductor workspace: a worktree and the chat last active in it. */
export interface ConductorWorkspace {
  id: string;
  repoId: string;
  repoName: string;
  repoRoot: string;
  directoryName: string;
  path: string;
  /** What git says is checked out there. */
  branch: string | null;
  archived: boolean;
  status: ConductorWorkspaceStatus;
  title: string | null;
  claudeSessionId: string | null;
  cli: "claude" | "codex";
  /** Other chats in it, which aren't imported. */
  otherSessions: number;
}

/** Conductor's app-wide defaults, mapped onto trace's settings. */
export interface ConductorDefaults {
  model: string | null;
  permissionMode: string | null;
  /** One of trace's editor ids. */
  editor: string | null;
  /** Conductor's choice when trace has no such editor. */
  editorUnknown: string | null;
}

export interface ConductorPreview {
  repos: ConductorRepo[];
  workspaces: ConductorWorkspace[];
  defaults: ConductorDefaults;
}

/** What the user ticked, by Conductor id, with any setup they edited. */
export interface ConductorSelection {
  repos: { id: string; setup: SetupConfig | null }[];
  workspaces: string[];
}

export interface ConductorReportItem {
  item: string;
  detail: string;
}

export interface ConductorReport {
  imported: ConductorReportItem[];
  skipped: ConductorReportItem[];
}

/** Whether Conductor's database is on this computer. Cheap: nothing is read. */
export function conductorImportAvailable(): Promise<boolean> {
  return invoke("conductor_import_available");
}

/** What an import would bring over; null when Conductor isn't here. Takes a few seconds. */
export function conductorImportPreview(): Promise<ConductorPreview | null> {
  return invoke("conductor_import_preview");
}

/** Import the selection; Conductor is read again on the Rust side. */
export function conductorImportApply(selection: ConductorSelection): Promise<ConductorReport> {
  return invoke("conductor_import_apply", { selection });
}
