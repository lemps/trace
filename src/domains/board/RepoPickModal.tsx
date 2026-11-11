import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { listRepos, setIssueRepo } from "@/ipc/repos";
import { basename } from "@/platform/paths";
import { useBoardStore } from "./store";

// Shown when a board kickoff needs a repo and none can be inferred (multiple
// repos, no assignment, no learned project default). Picking assigns the repo,
// teaches the project default, and retries the kickoff — all without leaving
// the board.
export function RepoPickModal({ issueKey }: { issueKey: string }) {
  const closeRepoPick = useBoardStore((s) => s.closeRepoPick);
  const kickoff = useBoardStore((s) => s.kickoff);
  const [repos, setRepos] = useState<string[]>([]);

  useEffect(() => {
    listRepos()
      .then(setRepos)
      .catch((err) => toast.error(`Couldn't load your repositories: ${String(err)}`));
  }, []);

  const pick = async (path: string) => {
    try {
      await setIssueRepo(issueKey, path);
      closeRepoPick();
      kickoff(issueKey);
    } catch (err) {
      toast.error(`Couldn't set ${issueKey}'s repository: ${String(err)}`);
    }
  };

  return (
    <Modal title={`Where does ${issueKey} live?`} onClose={closeRepoPick}>
      <div className="hint" style={{ marginBottom: 4 }}>
        Pick the repository for this ticket. To resolve similar tickets automatically, add a ticket
        mapping in Settings → Repositories.
      </div>
      <div className="repo-pick-list">
        {repos.map((path) => (
          <button
            type="button"
            key={path}
            className="repo-pick-row"
            onClick={() => void pick(path)}
          >
            <I.Code size={14} />
            <span className="name">{basename(path)}</span>
            <span className="path">{path}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
