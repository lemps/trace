import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { cloneRoot, setCloneRoot } from "@/ipc/repoSetup";

// Where new clones go, with a way to change it. The same setting as Settings →
// Agents → Repositories; it needn't exist yet, the first clone creates it.
export function CloneFolder({ label = "Clones go in" }: { label?: string }) {
  const [root, setRoot] = useState<string | null>(null);

  useEffect(() => {
    cloneRoot()
      .then(setRoot)
      .catch((err) => toast.error(`Couldn't read the clone folder: ${String(err)}`));
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
      toast.error(String(err));
    }
  };

  return (
    <div className="gh-folder">
      <span className="gh-folder-label">{label}</span>
      <span className="gh-mono gh-folder-path" title={root ?? ""}>
        {root ?? "…"}
      </span>
      <button type="button" className="btn" onClick={() => void change()}>
        Change
      </button>
    </div>
  );
}
