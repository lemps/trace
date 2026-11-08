import { useMemo, useState } from "react";
import { toast } from "@/app/toast";
import { I } from "@/components/Icon";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { Segmented } from "@/components/Segmented";
import { countChanges, type DiffLine } from "@/domains/agentChat/lineDiff";
import { ChangesView } from "./ChangesView";
import { DocBody } from "./DocBody";
import { docActions } from "./docActions";
import { type DocSeries, previousVersion, SOURCE_LABEL, versionDiff } from "./model";
import { usePlanStore } from "./store";
import { fullTime, shortTime } from "./time";
import { useFillAgent } from "./useFillAgent";
import { usePrintPdf } from "./usePrintPdf";

type View = "document" | "changes";

interface PlanViewerProps {
  workspaceId: string;
  agentTab: string;
  series: DocSeries;
}

// One document: its title and where it came from, a version picker (v1, v2, …),
// Document | Changes (a version against an earlier one), and its actions menu.
// Removing asks inline, never in a dialog.
export function PlanViewer({ workspaceId, agentTab, series }: PlanViewerProps) {
  const [versionId, setVersionId] = useState<string | null>(null);
  const [view, setView] = useState<View>("document");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"version" | "all" | null>(null);
  const remove = usePlanStore((s) => s.remove);
  const fill = useFillAgent(workspaceId, agentTab);
  const print = usePrintPdf();

  // A version that's gone (trimmed, removed) falls back to the newest.
  const doc = series.versions.find((v) => v.id === versionId) ?? series.latest;
  const earlier = series.versions.filter((v) => v.version < doc.version);
  const base =
    earlier.find((v) => v.id === baseId) ?? previousVersion(series, doc) ?? earlier[0] ?? null;
  const canDiff = doc.format === "markdown" && earlier.length > 0;
  const shown: View = canDiff ? view : "document";
  const lines: DiffLine[] = useMemo(
    () => (shown === "changes" && base ? versionDiff(base, doc) : []),
    [shown, base, doc]
  );
  const multi = series.versions.length > 1;

  const onRemove = (all: boolean) => {
    setConfirm(null);
    void remove(workspaceId, doc.id, all).catch((e) =>
      toast.error(`Couldn't remove: ${String(e)}`)
    );
  };

  return (
    <div className="pl-doc">
      <div className="pl-head">
        <div className="pl-head-text">
          <h2 className="pl-title">{doc.title}</h2>
          <div className="pl-meta" title={fullTime(doc.createdAt)}>
            {SOURCE_LABEL[doc.source]} · {shortTime(doc.createdAt)}
            {doc.format === "html" && " · HTML"}
          </div>
        </div>
        <div className="pl-head-actions">
          {multi && (
            <PopMenu
              align="right"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  className="btn pl-ver-btn"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  title="Show another version"
                  onClick={toggle}
                >
                  v{doc.version} of {series.versions.length} <I.Chevron size={11} />
                </button>
              )}
              sections={[
                {
                  title: "Versions",
                  items: [...series.versions].reverse().map((v) => ({
                    id: v.id,
                    label: `v${v.version} · ${shortTime(v.createdAt)}`,
                    checked: v.id === doc.id,
                    onSelect: () => setVersionId(v.id),
                  })),
                },
              ]}
            />
          )}
          {canDiff && (
            <Segmented<View>
              label="Show"
              value={shown}
              options={[
                { value: "document", label: "Document" },
                { value: "changes", label: "Changes" },
              ]}
              onChange={setView}
            />
          )}
          <PopMenu
            trigger={({ toggle }) => <MoreTrigger toggle={toggle} label="Document actions" />}
            sections={docActions({
              workspaceId,
              doc,
              versions: series.versions.length,
              print,
              sendToAgent: fill,
              askRemove: setConfirm,
            })}
          />
        </div>
      </div>
      {confirm && (
        <div className="pl-confirm" role="alert">
          <span>
            {confirm === "all" && multi
              ? `Remove “${doc.title}” and all ${series.versions.length} versions?`
              : confirm === "all"
                ? `Remove “${doc.title}”?`
                : `Remove version ${doc.version} of “${doc.title}”?`}
          </span>
          <button type="button" className="btn" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button type="button" className="btn danger" onClick={() => onRemove(confirm === "all")}>
            Remove
          </button>
        </div>
      )}
      {shown === "changes" && base ? (
        <ChangesView
          lines={lines}
          stat={countChanges(lines)}
          base={base}
          doc={doc}
          earlier={earlier}
          onPickBase={setBaseId}
        />
      ) : (
        <DocBody doc={doc} />
      )}
      {print.sheet}
    </div>
  );
}
