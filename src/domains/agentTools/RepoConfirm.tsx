import { useSyncExternalStore } from "react";
import { Modal } from "@/components/Modal";
import type { Ask } from "./confirmQueue";
import { repoAsks } from "./repoTools";

// The confirm card for an agent's add_repo / clone_repo: trace never adds a
// repository on an agent's word (its worktrees become trusted for Claude), so
// the user sees what, where and who asked, and answers here. One ask at a
// time, oldest first; closing the card declines it. The agent's call is
// waiting on the answer (`repoAsks`).

const subscribe = (fn: () => void) => repoAsks.subscribe(fn);
const snapshot = () => repoAsks.open();

function rows(ask: Ask): [string, string][] {
  const who: [string, string] = ["Asked by", ask.callerLabel];
  if (ask.kind === "clone") {
    return [["Repository", `github.com/${ask.target}`], ["Clone into", ask.detail], who];
  }
  return [["Folder", ask.target], who];
}

export function RepoConfirm() {
  const asks = useSyncExternalStore(subscribe, snapshot);
  const ask = asks[0];
  if (!ask) return null;
  const running = repoAsks.isRunning(ask.id);
  const clone = ask.kind === "clone";
  const deny = () => {
    if (!running) void repoAsks.answer(ask.id, false);
  };
  const more = asks.length > 1 ? ` (1 of ${asks.length})` : "";
  return (
    <Modal
      title={`${clone ? "Clone a repository" : "Add a repository"}?${more}`}
      onClose={deny}
      className="rc-modal"
      footer={
        <>
          <button type="button" className="btn" onClick={deny} disabled={running}>
            Deny
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void repoAsks.answer(ask.id, true)}
            disabled={running}
          >
            {running
              ? clone
                ? "Cloning…"
                : "Adding…"
              : clone
                ? "Clone and add"
                : "Add repository"}
          </button>
        </>
      }
    >
      <p className="rc-note">
        An agent wants to {clone ? "clone this repository and add it" : "add this folder"} to
        trace's repositories. Agents can then run in it, and Claude trusts its worktrees without
        asking.
        {clone && " Its suggested worktree setup (install commands) is saved too."}
      </p>
      <dl className="rc-facts">
        {rows(ask).map(([k, v]) => (
          <div key={k} className="rc-fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
