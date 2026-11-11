import { MiddlePath } from "@/domains/repos/MiddlePath";
import { useCloneRoot } from "./useCloneRoot";

// Where new clones go, with a way to change it, in the Clone from GitHub dialog.
// The same setting as Settings → Repositories → Cloning (`useCloneRoot`).
export function CloneFolder({ label = "Clones go in" }: { label?: string }) {
  const { root, change } = useCloneRoot();
  return (
    <div className="gh-folder">
      <span className="gh-folder-label">{label}</span>
      <MiddlePath className="gh-mono gh-folder-path" path={root ?? "…"} />
      <button type="button" className="btn" onClick={() => void change()}>
        Change…
      </button>
    </div>
  );
}
