import { invoke } from "@tauri-apps/api/core";

// Saved prompts (`commands/saved_prompts.rs`): reusable messages the composer offers
// as `/name`, kept in `saved-prompts.json` in the app config dir.

export interface SavedPrompt {
  id: string;
  /** The slug typed after `/`. */
  name: string;
  /** What the slash menu and Settings show. */
  title: string;
  /** What fills the composer. */
  body: string;
  /** ms since the epoch. */
  createdAt: number;
  updatedAt: number;
}

/** What to save: no `id` adds a prompt, an `id` replaces that one. */
export interface SavedPromptDraft {
  id?: string;
  name: string;
  title: string;
  body: string;
}

function isSavedPrompt(v: unknown): v is SavedPrompt {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.title === "string" &&
    typeof p.body === "string" &&
    typeof p.createdAt === "number" &&
    typeof p.updatedAt === "number"
  );
}

function asSavedPrompt(v: unknown): SavedPrompt {
  if (!isSavedPrompt(v)) throw new Error("trace sent back a saved prompt it couldn't read.");
  return v;
}

/** Every saved prompt, in the order added (the built-ins on a new install). */
export async function listSavedPrompts(): Promise<SavedPrompt[]> {
  const raw: unknown = await invoke("list_saved_prompts");
  return Array.isArray(raw) ? raw.filter(isSavedPrompt) : [];
}

/** Add or replace one; returns it as stored (name slugged, text trimmed). */
export async function saveSavedPrompt(prompt: SavedPromptDraft): Promise<SavedPrompt> {
  return asSavedPrompt(await invoke("save_saved_prompt", { prompt }));
}

export function deleteSavedPrompt(id: string): Promise<void> {
  return invoke("delete_saved_prompt", { id });
}
