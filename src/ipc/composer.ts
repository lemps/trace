import { invoke } from "@tauri-apps/api/core";

// The chat composer's own backend calls (`commands/composer.rs`).

/** Of `paths`, the ones still on disk (a restored draft's files may have gone). */
export async function existingAttachments(paths: string[]): Promise<string[]> {
  const raw: unknown = await invoke("existing_attachments", { paths });
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === "string") : [];
}
