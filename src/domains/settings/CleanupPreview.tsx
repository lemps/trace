import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { InlineConfirm } from "@/components/InlineConfirm";
import { relTime } from "@/domains/sessions/time";
import type { CleanupReport } from "@/ipc/cleanup";

interface CleanupPreviewProps {
  /** null while the first preview is loading. */
  report: CleanupReport | null;
  busy: boolean;
  onRun: () => void;
}

// What the auto-cleanup rules select right now: the workspaces the next pass
// will delete, plus any it has to keep (running, uncommitted work) and why.
export function CleanupPreview({ report, busy, onRun }: CleanupPreviewProps) {
  if (!report) return <span className="hint">Checking workspaces…</span>;
  const deletable = report.items.filter((it) => !it.held);
  if (report.items.length === 0) {
    return <span className="hint">Nothing matches these rules right now.</span>;
  }
  return (
    <div className="cleanup-preview">
      <div className="cleanup-preview-head">
        <span className="hint">
          {deletable.length === 0
            ? "Matching workspaces are being kept:"
            : `The next pass deletes ${countLabel(deletable.length)}:`}
        </span>
        {deletable.length > 0 && (
          <InlineConfirm
            label={
              <>
                <I.Trash size={14} />{" "}
                <BusyLabel busy={busy} idle="Clean up now" working="Cleaning up…" />
              </>
            }
            disabled={busy}
            message={`Delete ${countLabel(deletable.length)} now?`}
            confirmLabel={`Delete ${deletable.length}`}
            onConfirm={onRun}
          />
        )}
      </div>
      <div className="repo-list">
        {report.items.map((it) => (
          <div key={it.path} className="repo-row">
            {it.kind === "ticket" ? <I.Ticket size={14} /> : <I.Chat size={14} />}
            <span className="repo-name">{it.label}</span>
            <span className="repo-path" title={it.path}>
              last active {relTime(it.lastActive)}
            </span>
            {it.held && (
              <span className="wt-chip dirty" title={`Kept: ${it.held}`}>
                kept — {it.held}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const countLabel = (n: number) => `${n} workspace${n === 1 ? "" : "s"}`;
