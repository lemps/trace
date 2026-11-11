import { useEffect } from "react";
import { create } from "zustand";
import { type ClaudeCatalog, type ClaudeModel, claudeCatalog } from "@/ipc/claudeCatalog";

// What the installed Claude Code offers, asked of the CLI once, on first use: its
// models, for every model picker (the composer's pill, the New session dialog),
// and what its slash commands do, for the composer's `/` menu. A new model or
// command arrives with a CLI update, so it appears without a trace release. Until
// it answers, or if it can't, pickers fall back to Claude's aliases
// (`CLAUDE_MODEL_ALIASES`) and the menu to the commands' bare names.

interface CatalogState extends ClaudeCatalog {
  load: () => void;
}

let asked = false;

export const useClaudeCatalog = create<CatalogState>((set) => ({
  models: [],
  commands: [],
  load: () => {
    if (asked) return;
    asked = true;
    void claudeCatalog()
      .then((catalog) => set(catalog))
      .catch(() => {
        // No CLI, or it didn't answer: keep the fallbacks, and try again next time.
        asked = false;
      });
  },
}));

function useLoaded(): void {
  const load = useClaudeCatalog((s) => s.load);
  useEffect(() => load(), [load]);
}

/** Claude Code's models, loaded on first use. Empty until they arrive. */
export function useClaudeModels(): ClaudeModel[] {
  useLoaded();
  return useClaudeCatalog((s) => s.models);
}

/** What each of Claude Code's slash commands does, by name. Empty until it arrives. */
export function useCommandDetails(): ClaudeCatalog["commands"] {
  useLoaded();
  return useClaudeCatalog((s) => s.commands);
}

import.meta.hot?.accept(() => location.reload());
