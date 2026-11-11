import { I } from "@/components/Icon";
import { RowMenuPopover, RowMore } from "@/components/RowMenu";
import { StatusLight } from "@/components/StatusLight";
import { type RowActionSection, useRowMenu } from "@/components/useRowMenu";
import { useLiveStore } from "@/domains/live/store";
import type { WorktreeInfo } from "@/ipc/worktrees";
import { type CleanupMark, worktreeName } from "./worktreeModel";

interface WorktreeRowProps {
  wt: WorktreeInfo;
  /** What the next auto-cleanup pass does to it, when it does anything. */
  mark?: CleanupMark;
  /** The preview is being worked out again: its mark is the previous one. */
  stale: boolean;
  actions: RowActionSection[];
  /** Its remove confirm is open under it. */
  isOpen: boolean;
  /** It's being removed: dimmed until the list rescans. */
  removing: boolean;
}

// One worktree, in fixed columns: name · branch · status · ⋯. Its status is facts
// about the checkout (merged, uncommitted), drawn as neutral chips; only a live
// agent in it is agent state, drawn with the agent's own StatusLight.
export function WorktreeRow({ wt, mark, stale, actions, isOpen, removing }: WorktreeRowProps) {
  const menu = useRowMenu();
  const name = worktreeName(wt);
  const ownerId = wt.owner?.id;
  const light = useLiveStore((s) => (ownerId ? s.info[ownerId]?.light : undefined));
  const markText = mark
    ? mark.kind === "delete"
      ? "Deleted on the next pass"
      : `Kept: ${mark.reason}`
    : null;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: right-click opens the same menu as its ⋯ */}
      <div
        className={`wt-row${isOpen ? " open" : ""}${menu.at ? " menu-open" : ""}${removing ? " removing" : ""}`}
        aria-busy={removing || undefined}
        onContextMenu={menu.onContextMenu}
      >
        <span className="wt-glyph">
          <I.Branch size={14} />
        </span>
        <span className="wt-name" title={name.title}>
          {name.text}
        </span>
        <span className={`wt-branch${wt.branch ? "" : " quiet"}`}>{wt.branch ?? "detached"}</span>
        <span className="wt-status">
          {light ? (
            <StatusLight light={light} variant="word" />
          ) : (
            wt.running && <span className="wt-fact">Running</span>
          )}
          {wt.merged && <span className="wt-fact">Merged</span>}
          {wt.dirty && <span className="wt-fact">Uncommitted</span>}
          {markText && (
            <span
              className={`wt-fact wt-mark${stale ? " stale" : ""}`}
              title={mark?.kind === "kept" ? markText : undefined}
            >
              {markText}
            </span>
          )}
        </span>
        <RowMore menu={menu} label="Worktree actions" className="wt-actions" />
      </div>
      <RowMenuPopover menu={menu} sections={actions} />
    </>
  );
}
