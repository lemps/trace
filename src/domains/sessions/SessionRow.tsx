import { openUrl } from "@tauri-apps/plugin-opener";
import { type DragEvent, type MouseEvent, useState } from "react";
import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";
import type { AgentLight } from "@/domains/live/types";
import type { SessionOverview } from "@/ipc/workspace";
import { basename } from "@/platform/paths";
import { companionsOf } from "./agentRoster";
import { CreatorChip } from "./CreatorChip";
import { creatorLabel, creatorOf } from "./createdBy";
import { sessionsDrag, setRowDragging } from "./dragState";
import { HostChip } from "./HostChip";
import type { SessionDiffStat } from "./hooks/useSessionDiffs";
import type { RowOrdering } from "./SessionList";
import { hostPlace } from "./sessionHost";
import { TitleEditor } from "./TitleEditor";
import { relTime } from "./time";
import type { ScratchSession } from "./types";

/**
 * The branch worth showing: not the auto-named `workspace/<session id>` every
 * session starts on (that's noise), but one the agent created, like `fix/…`.
 */
function meaningfulBranch(session: ScratchSession, branch: string | null): string | null {
  if (!branch) return null;
  const auto = `workspace/${session.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return branch === auto ? null : branch;
}

interface SessionRowProps {
  session: ScratchSession;
  light: AgentLight;
  /** Per-agent breakdown for the light's tooltip. */
  lightDetail: string;
  overview?: SessionOverview;
  diff?: SessionDiffStat;
  onOpen: () => void;
  onArchive: () => void;
  onRename: (title: string) => void;
  /** Its place in the list's order (`SessionList`). */
  ordering: RowOrdering;
}

// One session as a list row: status dot, name, where it works, its PR, its
// diff and age — the facts that decide which one to open, and nothing else.
// Rename/archive appear on hover; the row drags up and down its list, into
// other sections, tabs and the bin. One an agent started says who, and links to it;
// sorted by "Started by", it sits indented under its parent instead.
export function SessionRow(props: SessionRowProps) {
  const { session, light, lightDetail, overview, diff, onOpen, onArchive, onRename } = props;
  const { depth, dropMark, onKeyDown } = props.ordering;
  const createdBy = creatorOf(session);
  const [renaming, setRenaming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const companions = companionsOf(session);
  const branch = meaningfulBranch(session, overview?.branch ?? null);
  // A sandbox session has no checkout here to read: say which sandbox and repo.
  const where = session.host
    ? hostPlace(session.host)
    : [overview ? basename(overview.repo) : null, branch].filter(Boolean).join(" · ");
  const pr = overview?.pr;
  const hasDiff = diff != null && (diff.add > 0 || diff.del > 0);

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const onDragStart = (e: DragEvent) => {
    sessionsDrag.current = { kind: "session", id: session.id };
    e.dataTransfer.effectAllowed = "move";
    // WKWebView won't start a drag session without data (see board/Board.tsx).
    e.dataTransfer.setData("text/plain", session.id);
    setRowDragging(true);
    setDragging(true);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: hosts nested buttons; HTML forbids nested interactives
    <div
      className={`session-row${dropMark ? ` drop-${dropMark}` : ""}${dragging ? " dragging" : ""}`}
      data-sid={session.id}
      role="button"
      tabIndex={0}
      draggable={!renaming}
      onDragStart={onDragStart}
      onDragEnd={() => {
        sessionsDrag.current = null;
        setRowDragging(false);
        setDragging(false);
      }}
      onClick={renaming ? undefined : onOpen}
      onKeyDown={(e) => {
        if (renaming) return;
        onKeyDown(e);
        if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) onOpen();
      }}
    >
      <span className="sr-grip" title="Drag to reorder" aria-hidden="true">
        <I.Grip size={12} />
      </span>
      <StatusLight light={light} title={lightDetail} variant="word" />
      <div className="sr-name">
        {depth > 0 && (
          <span
            className="sr-indent"
            style={{ width: depth * 16 }}
            title={`Started by “${creatorLabel(createdBy)}”, above`}
          >
            <I.StartedBy size={12} />
          </span>
        )}
        {renaming ? (
          <TitleEditor
            initial={session.title}
            onSave={onRename}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <span className="sr-title">{session.title}</span>
        )}
        {session.cli !== "claude" && (
          <span className={`session-cli ${session.cli}`}>{session.cli}</span>
        )}
        {companions.length > 0 && (
          <span
            className="session-cli"
            title={`Also in this worktree: ${companions.map((a) => a.cli).join(", ")}`}
          >
            +{companions.length}
          </span>
        )}
        {session.host && <HostChip host={session.host} />}
        {depth === 0 && <CreatorChip createdBy={createdBy} />}
      </div>
      <span
        className="sr-where"
        title={session.host ? session.host.sandbox : (overview?.branch ?? undefined)}
      >
        {where}
      </span>
      <span className="sr-pr">
        {pr && (
          <button
            type="button"
            className={`pr-pill ${pr.state}`}
            onClick={stop(() => void openUrl(pr.url))}
            title={`Open PR #${pr.number} on GitHub`}
          >
            #{pr.number} {pr.state}
          </button>
        )}
      </span>
      <span className="sr-diff">
        {hasDiff && (
          <>
            <span className="add">+{diff.add}</span> <span className="del">−{diff.del}</span>
          </>
        )}
      </span>
      <span className="sr-time">{relTime(session.createdAt)}</span>
      <span className="sr-actions">
        <button
          type="button"
          onClick={stop(() => setRenaming(true))}
          aria-label="Rename session"
          title="Rename"
        >
          <I.Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={stop(onArchive)}
          aria-label="Archive session"
          title="Archive"
        >
          <I.Archive size={12} />
        </button>
      </span>
    </div>
  );
}
