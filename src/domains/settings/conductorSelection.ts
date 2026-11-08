// What the Conductor import preview starts ticked, and turning ticks into the
// selection the backend takes. Pure, so it's tested without a renderer.

import type {
  ConductorPreview,
  ConductorSelection,
  ConductorWorkspace,
} from "../../ipc/conductorImport.ts";
import type { SetupConfig } from "../repos/types.ts";

export type DefaultKey = "model" | "permissionMode" | "editor";

export interface Ticks {
  repos: Set<string>;
  workspaces: Set<string>;
  defaults: Set<DefaultKey>;
  /** Setups edited in the preview, by repo id. */
  setups: Record<string, SetupConfig>;
  /** Custom prompts to import, by key. */
  prompts: Set<string>;
  /** Prompt names edited in the preview, by key. */
  promptNames: Record<string, string>;
}

/** What trace has set now, so a default only starts ticked where it fills a gap. */
export interface CurrentDefaults {
  model: string;
  hasPermissionMode: boolean;
}

/** A workspace that can be adopted: its folder is still there. */
export function canAdopt(ws: ConductorWorkspace): boolean {
  return ws.status !== "folderMissing";
}

/**
 * Repos on this computer, live workspaces that can be adopted, and defaults
 * trace doesn't have yet. Archived workspaces are never ticked to start.
 */
export function initialTicks(preview: ConductorPreview, current: CurrentDefaults): Ticks {
  const defaults = new Set<DefaultKey>();
  if (preview.defaults.model && !current.model) defaults.add("model");
  if (preview.defaults.permissionMode && !current.hasPermissionMode) {
    defaults.add("permissionMode");
  }
  if (preview.defaults.editor) defaults.add("editor");
  return {
    repos: new Set(preview.repos.filter((r) => r.exists).map((r) => r.id)),
    workspaces: new Set(
      preview.workspaces.filter((w) => !w.archived && canAdopt(w)).map((w) => w.id)
    ),
    defaults,
    setups: {},
    prompts: new Set(preview.prompts.filter((p) => !p.existing).map((p) => p.key)),
    promptNames: {},
  };
}

/** A copy of `set` with `id` in or out. */
export function toggled<T>(set: Set<T>, id: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** The ticks as the backend's selection, keeping only importable items. */
export function toSelection(preview: ConductorPreview, ticks: Ticks): ConductorSelection {
  return {
    repos: preview.repos
      .filter((r) => r.exists && ticks.repos.has(r.id))
      .map((r) => ({ id: r.id, setup: ticks.setups[r.id] ?? null })),
    workspaces: preview.workspaces
      .filter((w) => canAdopt(w) && ticks.workspaces.has(w.id))
      .map((w) => w.id),
    prompts: preview.prompts
      .filter((p) => !p.existing && ticks.prompts.has(p.key))
      .map((p) => ({ key: p.key, name: ticks.promptNames[p.key] ?? null })),
  };
}

/** How many things the Import button will bring over. */
export function selectedCount(preview: ConductorPreview, ticks: Ticks): number {
  const sel = toSelection(preview, ticks);
  const defaults = [...ticks.defaults].filter((k) => preview.defaults[k]).length;
  return sel.repos.length + sel.workspaces.length + sel.prompts.length + defaults;
}

/**
 * Extra CLI args with `--permission-mode` set to `mode`, replacing any already
 * there (both `--permission-mode x` and `--permission-mode=x`).
 */
export function withPermissionMode(rawArgs: string, mode: string): string {
  const words = rawArgs.trim() ? rawArgs.trim().split(/\s+/) : [];
  const kept: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? "";
    if (w === "--permission-mode") {
      i++;
      continue;
    }
    if (w.startsWith("--permission-mode=")) continue;
    kept.push(w);
  }
  return [...kept, "--permission-mode", mode].join(" ");
}

/** Whether the extra args already pick a permission mode. */
export function hasPermissionMode(rawArgs: string): boolean {
  return /(^|\s)--permission-mode(\s|=|$)/.test(rawArgs);
}
