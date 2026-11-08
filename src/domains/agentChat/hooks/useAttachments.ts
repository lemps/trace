import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { toast } from "@/app/toast";
import { saveChatAttachment } from "@/ipc/agentChat";
import { useDraftFiles, useDrafts } from "../drafts";

export interface Attachments {
  /** Absolute paths, in the order added. */
  paths: string[];
  /** Saving pasted or dropped files is under way. */
  saving: boolean;
  /** Pick files from disk; they're attached by their own path. */
  pick: () => void;
  /** Files pasted or dropped: bytes with no path, so they're saved first. */
  addFiles: (files: readonly File[]) => void;
  remove: (path: string) => void;
  /** Swap the whole set (a failed send puts its files back). */
  set: (paths: string[]) => void;
}

/** A pasted screenshot is named `image.png`; give it something to tell two apart. */
function nameFor(file: File): string {
  if (file.name && file.name !== "image.png") return file.name;
  const ext = file.type.startsWith("image/") ? file.type.slice(6) : "bin";
  return `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`;
}

// What goes with the next message from the composer: files picked from disk,
// pasted (a screenshot from the clipboard) or dropped onto it. The agent gets
// pictures as images and anything else as a path to read. The list is part of the
// workspace's draft (`drafts.ts`), so it outlasts the composer; a file still saving
// when you switch away lands in the workspace it was added to.
export function useAttachments(workspaceId: string): Attachments {
  const paths = useDraftFiles(workspaceId);
  const [saving, setSaving] = useState(0);

  const add = useCallback(
    (more: string[]) => useDrafts.getState().addAttachments(workspaceId, more),
    [workspaceId]
  );

  const pick = useCallback(() => {
    void open({ multiple: true, directory: false, title: "Attach files" })
      .then((picked) => {
        if (!picked) return;
        add(Array.isArray(picked) ? picked : [picked]);
      })
      .catch((e) => toast.error(`Couldn't open the file picker: ${String(e)}`));
  }, [add]);

  const addFiles = useCallback(
    (files: readonly File[]) => {
      for (const file of files) {
        setSaving((n) => n + 1);
        void file
          .arrayBuffer()
          .then((buf) => saveChatAttachment(nameFor(file), new Uint8Array(buf)))
          .then((path) => add([path]))
          .catch((e) => toast.error(`Couldn't attach ${file.name || "that file"}: ${String(e)}`))
          .finally(() => setSaving((n) => n - 1));
      }
    },
    [add]
  );

  const set = useCallback(
    (next: string[]) => useDrafts.getState().setAttachments(workspaceId, next),
    [workspaceId]
  );
  const remove = useCallback((path: string) => set(paths.filter((p) => p !== path)), [paths, set]);

  return { paths, saving: saving > 0, pick, addFiles, remove, set };
}
