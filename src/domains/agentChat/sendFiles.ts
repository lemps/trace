import { toast } from "@/app/toast";
import { existingAttachments } from "@/ipc/composer";

/**
 * The `paths` still on disk, saying how many were left off. A draft kept across a
 * restart can name a paste that's since been swept or a file moved away. If the
 * check itself fails, they all go and the send reports any that are missing.
 */
export async function keepExisting(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return paths;
  const kept = await existingAttachments(paths).catch(() => paths);
  const gone = paths.length - kept.length;
  if (gone > 0) {
    toast.info(
      gone === 1
        ? "An attached file no longer exists, so it was left off."
        : `${gone} attached files no longer exist, so they were left off.`
    );
  }
  return kept;
}
