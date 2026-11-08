import { create } from "zustand";
import {
  deleteSavedPrompt,
  listSavedPrompts,
  type SavedPrompt,
  type SavedPromptDraft,
  saveSavedPrompt,
} from "@/ipc/savedPrompts";

// The saved prompts as the backend has them (`saved-prompts.json`), loaded once
// for the composer's slash menu and Settings, and kept in step with every save
// and delete made from here.

interface SavedPromptStore {
  prompts: SavedPrompt[];
  loaded: boolean;
  /** Load them, once. A failed load is retried on the next call. */
  ensure: () => void;
  /** Add or replace one; throws the backend's reason (a taken name, no text). */
  save: (draft: SavedPromptDraft) => Promise<SavedPrompt>;
  remove: (id: string) => Promise<void>;
}

let loading: Promise<void> | null = null;

export const useSavedPrompts = create<SavedPromptStore>((set, get) => ({
  prompts: [],
  loaded: false,
  ensure() {
    if (get().loaded || loading) return;
    loading = listSavedPrompts()
      .then((prompts) => set({ prompts, loaded: true }))
      .catch(() => {
        // The menu just lacks saved prompts; Settings shows its own error on save.
      })
      .finally(() => {
        loading = null;
      });
  },
  async save(draft) {
    const saved = await saveSavedPrompt(draft);
    set((s) => {
      const at = s.prompts.findIndex((p) => p.id === saved.id);
      if (at < 0) return { prompts: [...s.prompts, saved] };
      const prompts = [...s.prompts];
      prompts[at] = saved;
      return { prompts };
    });
    return saved;
  },
  async remove(id) {
    await deleteSavedPrompt(id);
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
  },
}));

// A hot update would leave subscribers on a stale copy of this state, so reload instead.
import.meta.hot?.accept(() => location.reload());
