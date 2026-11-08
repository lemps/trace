import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { toast } from "@/app/toast";
import { saveChatAttachment } from "@/ipc/agentChat";

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
// pictures as images and anything else as a path to read.
export function useAttachments(): Attachments {
  const [paths, setPaths] = useState<string[]>([]);
  const [saving, setSaving] = useState(0);

  const add = useCallback((more: string[]) => {
    setPaths((was) => [...new Set([...was, ...more])]);
  }, []);

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

  const remove = useCallback((path: string) => {
    setPaths((was) => was.filter((p) => p !== path));
  }, []);

  return { paths, saving: saving > 0, pick, addFiles, remove, set: setPaths };
}
