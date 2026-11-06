import { basename, forwardSlashes } from "@/platform/paths";
import { useWorkspaceInfo } from "./hooks/useWorkspaceInfo";

/** `.worktrees/x` for a worktree under the repo, else the path's last segment. */
function shortCwd(cwd: string, repo: string): string {
  const prefix = `${forwardSlashes(repo)}/`;
  const path = forwardSlashes(cwd);
  return path.startsWith(prefix) ? path.slice(prefix.length) : basename(cwd);
}

interface WorkspaceSectionProps {
  workspaceId: string;
  /** Agent ids whose turn-ends should re-read the checkout (companions too). */
  turnIds?: string[];
  refreshKey?: unknown;
}

// "Workspace" rail section for both detail views: the repo, the branch that's
// really checked out (read from git — agents sometimes switch), and the worktree.
export function WorkspaceSection({ workspaceId, turnIds, refreshKey }: WorkspaceSectionProps) {
  const info = useWorkspaceInfo(workspaceId, turnIds, refreshKey);
  if (!info) return null;
  return (
    <div className="ctx-section">
      <div className="label">Workspace</div>
      <div className="ctx-row">
        <span className="k">Repository</span>
        <span className="v" title={info.repo}>
          {basename(info.repo)}
        </span>
      </div>
      {info.branch && (
        <div className="ctx-row">
          <span className="k">Branch</span>
          <span className="v" title={info.branch}>
            {info.branch}
          </span>
        </div>
      )}
      <div className="ctx-row">
        <span className="k">Worktree</span>
        <span className="v" title={info.cwd}>
          {info.isWorktree ? shortCwd(info.cwd, info.repo) : "repo root"}
        </span>
      </div>
    </div>
  );
}
