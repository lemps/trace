import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { cloneRoot, setCloneRoot } from "@/ipc/repoSetup";

interface CloneRoot {
  /** The folder new clones go in; null until read. */
  root: string | null;
  /** Pick another folder (a dialog) and save it. */
  change: () => Promise<void>;
}

/**
 * The folder new GitHub clones go in, and a way to change it. One setting, shown in
 * Settings → Repositories → Cloning and in the Clone from GitHub dialog. It needn't
 * exist yet: the first clone creates it.
 */
export function useCloneRoot(): CloneRoot {
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    cloneRoot()
      .then((r) => live && setRoot(r))
      .catch((err) => toast.error(`Couldn't read the clone folder: ${String(err)}`));
    return () => {
      live = false;
    };
  }, []);

  const change = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose where to clone repositories",
      defaultPath: root ?? undefined,
    });
    if (typeof picked !== "string") return;
    try {
      setRoot(await setCloneRoot(picked));
    } catch (err) {
      toast.error(`Couldn't change the clone folder: ${String(err)}`);
    }
  };

  return { root, change };
}
