import { toast } from "@/app/toast";
import { PopMenu } from "@/components/PopMenu";
import { editorItems } from "@/domains/agent/editorItems";
import { copyPlain } from "@/ipc/clipboard";
import { basename } from "@/platform/paths";

interface FileLinkProps {
  workspaceId: string;
  path: string;
  /** The workspace's directory, to show paths inside it relative to it. */
  root: string | null;
}

// A file a tool read or changed. Clicking offers to open it in an editor or copy
// its path. It sits beside a tool row's fold toggle, not inside it.
export function FileLink({ workspaceId, path, root }: FileLinkProps) {
  const shown = relativeTo(path, root);
  return (
    <span className="tx-file">
      <PopMenu
        align="left"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className="tx-file-link"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
            title={path}
          >
            <span className="dir">{shown.slice(0, shown.length - basename(shown).length)}</span>
            {basename(shown)}
          </button>
        )}
        sections={[
          { items: editorItems(workspaceId, path) },
          {
            items: [
              {
                label: "Copy path",
                onSelect: () => {
                  void copyPlain(path)
                    .then(() => toast.success("Path copied"))
                    .catch((e) => toast.error(String(e)));
                },
              },
            ],
          },
        ]}
      />
    </span>
  );
}

/** The workspace-relative form of `path`, when it sits under `root`. */
function relativeTo(path: string, root: string | null): string {
  if (!root) return path;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = norm(path);
  const r = norm(root);
  const under = p.toLowerCase().startsWith(`${r.toLowerCase()}/`);
  return under ? p.slice(r.length + 1) : path;
}
