import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Fragment, useState } from "react";
import { openCreator, openWorkspace } from "@/app/openWorkspace";
import { toast } from "@/app/toast";
import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { ConfirmPrompt, InlineConfirm } from "@/components/InlineConfirm";
import { copyText } from "@/domains/agent/copyText";
import type { WorktreeInfo, WorktreeOwner } from "@/ipc/worktrees";
import { basename } from "@/platform/paths";
import { SettingSection } from "./SettingSection";
import type { WorktreesState } from "./useWorktrees";
import { WorktreeRow } from "./WorktreeRow";
import { type CleanupMark, groupByRepo, removableMerged, worktreeName } from "./worktreeModel";
import { worktreeRowMenu } from "./worktreeRowMenu";

interface WorktreeListProps {
  state: WorktreesState;
  /** The next auto-cleanup pass's effect on each listed worktree, by path. */
  marks: Map<string, CleanupMark>;
  /** The preview behind `marks` is being worked out again. */
  stale: boolean;
}

/** Open what a worktree belongs to: its session or ticket, or its scheduled prompt's page. */
function openOwner(owner: WorktreeOwner) {
  if (owner.kind === "prompt") {
    openCreator({ kind: "schedule", promptId: owner.id, label: owner.label });
  } else {
    openWorkspace(owner.id, () => {});
  }
}

const reveal = (wt: WorktreeInfo) =>
  void revealItemInDir(wt.path).catch(() =>
    toast.error(`${worktreeName(wt).text} isn't there any more.`)
  );

// Settings → Worktrees' list: every worktree trace made, grouped by repository in
// one joined list, with bulk removal of the merged ones in the head.
export function WorktreeList({ state, marks, stale }: WorktreeListProps) {
  const { worktrees, scanning, failed, busy } = state;
  const [confirming, setConfirming] = useState<string | null>(null);
  const removable = removableMerged(worktrees);
  const n = removable.length;

  const actions = (
    <>
      <IconButton
        size="sm"
        label="Refresh"
        onClick={state.refresh}
        disabled={busy !== null || scanning}
      >
        <I.Refresh size={14} />
      </IconButton>
      {(n > 0 || busy === "*") && (
        <InlineConfirm
          className="btn sm"
          size="sm"
          label={<BusyLabel busy={busy === "*"} idle={`Remove ${n} merged`} working="Removing…" />}
          disabled={busy !== null}
          message={`Remove ${n} merged worktree${n === 1 ? "" : "s"} and their branches?`}
          confirmLabel={`Remove ${n}`}
          onConfirm={() => void state.removeAll(removable)}
        />
      )}
    </>
  );

  const body = () => {
    if (worktrees.length === 0) {
      if (failed)
        return <div className="rs-empty">Couldn't list the worktrees. Refresh to try again.</div>;
      return (
        <div className="rs-empty">
          {scanning ? "Scanning repositories…" : "No worktrees right now."}
        </div>
      );
    }
    return (
      <div className="rs-list wt-list">
        {groupByRepo(worktrees).map((group) => (
          <Fragment key={group.repo}>
            <div className="wt-group" title={group.repo}>
              {basename(group.repo)}
            </div>
            {group.items.map((wt) => (
              <Fragment key={wt.path}>
                <WorktreeRow
                  wt={wt}
                  mark={marks.get(wt.path)}
                  stale={stale}
                  isOpen={confirming === wt.path}
                  removing={busy === wt.path}
                  actions={worktreeRowMenu({
                    wt,
                    onOpen: openOwner,
                    onReveal: () => reveal(wt),
                    onCopyPath: () => copyText(wt.path, "path"),
                    onRemove: () => setConfirming(wt.path),
                  })}
                />
                {confirming === wt.path && (
                  <div className="rs-band rs-confirm">
                    <ConfirmPrompt
                      size="sm"
                      message={
                        wt.dirty
                          ? `${worktreeName(wt).text} has uncommitted changes that will be lost. Remove it and its branch?`
                          : `Remove ${worktreeName(wt).text} and its branch?`
                      }
                      confirmLabel="Remove"
                      onCancel={() => setConfirming(null)}
                      onConfirm={() => {
                        setConfirming(null);
                        void state.remove(wt);
                      }}
                    />
                  </div>
                )}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
    );
  };

  return (
    <SettingSection
      title="Worktrees"
      desc="Every worktree trace made. Removing one deletes its folder and its branch."
      actions={actions}
    >
      {body()}
    </SettingSection>
  );
}
