import { useMemo, useState } from "react";
import { toast } from "@/app/toast";
import { BackButton } from "@/components/BackButton";
import { I } from "@/components/Icon";
import { ConfirmPrompt } from "@/components/InlineConfirm";
import { MoreTrigger, PopMenu } from "@/components/PopMenu";
import { Switch } from "@/components/Switch";
import { useDetailKeys } from "@/domains/agent/useDetailKeys";
import { useNow } from "@/hooks/useNow";
import { describeSchedule, formatWhen, relative } from "./describe";
import { PromptView } from "./PromptView";
import { RunList } from "./RunList";
import { RunViewer } from "./RunViewer";
import { useSchedulesStore } from "./store";
import type { ScheduledPrompt } from "./types";

/** The detail has no ⌘1–9 tabs; only Esc (back, as its BackButton says). */
const NO_TABS: readonly string[] = [];
const noTab = () => {};

interface ScheduleDetailProps {
  prompt: ScheduledPrompt;
  onEdit: () => void;
}

// Full-screen detail for one scheduled prompt (the `.detail` shell sessions and
// issues use): its run history on the left, the selected run's conversation on
// the right — live while it runs, replayed from disk once it's done. The header's
// right group is status → Run now / Stop run → ⋯ (Edit, Delete; Delete confirms here).
export function ScheduleDetail({ prompt, onEdit }: ScheduleDetailProps) {
  const allRuns = useSchedulesStore((s) => s.runs);
  const openRunId = useSchedulesStore((s) => s.openRunId);
  const selectRun = useSchedulesStore((s) => s.selectRun);
  const close = useSchedulesStore((s) => s.close);
  const setEnabled = useSchedulesStore((s) => s.setEnabled);
  const runNow = useSchedulesStore((s) => s.runNow);
  const stopRun = useSchedulesStore((s) => s.stopRun);
  const remove = useSchedulesStore((s) => s.remove);
  const now = useNow(30_000);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDetailKeys(close, NO_TABS, noTab);

  const runs = useMemo(() => allRuns.filter((r) => r.promptId === prompt.id), [allRuns, prompt.id]);
  // Default to the newest run — which is also where a fresh "Run now" lands.
  const active = runs.find((r) => r.id === openRunId) ?? runs[0];
  const live = runs.find((r) => r.status === "running");
  const fail = (err: unknown) => toast.error(String(err));

  // Confirmed inline first: this kills a live run and deletes the history and worktree.
  const onDelete = () => {
    setConfirmDelete(false);
    void remove(prompt.id)
      .then(() => toast.success(`Deleted “${prompt.title}”`))
      .catch(fail);
  };

  const next =
    prompt.enabled && prompt.nextRunAt
      ? `next ${formatWhen(prompt.nextRunAt)} (${relative(prompt.nextRunAt, now)})`
      : "paused";

  return (
    <div className="detail">
      <div className="detail-top">
        <BackButton label="Scheduled" onBack={close} />
        <span className="session-avatar">
          <I.Clock size={16} />
        </span>
        <div>
          <span className="id">
            {describeSchedule(prompt.schedule)} · {next}
          </span>
          <div className="ttl">{prompt.title}</div>
        </div>
        <div className="right">
          <span className="sched-enabled">
            {prompt.enabled ? "Active" : "Paused"}
            <Switch
              on={prompt.enabled}
              onChange={(enabled) => void setEnabled(prompt.id, enabled).catch(fail)}
              label={prompt.enabled ? "Pause schedule" : "Resume schedule"}
            />
          </span>
          {confirmDelete && (
            <ConfirmPrompt
              message={
                live
                  ? "Stop its run and delete it, its run history and its worktree?"
                  : "Delete it, its run history and its worktree?"
              }
              confirmLabel={
                <>
                  <I.Trash size={14} /> Delete
                </>
              }
              onCancel={() => setConfirmDelete(false)}
              onConfirm={onDelete}
            />
          )}
          {live ? (
            <button type="button" className="btn" onClick={() => void stopRun(live.id).catch(fail)}>
              <I.Stop size={14} /> Stop run
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => void runNow(prompt.id).catch(fail)}
            >
              <I.Play size={14} /> Run now
            </button>
          )}
          <PopMenu
            trigger={({ open, toggle }) => (
              <MoreTrigger open={open} toggle={toggle} label="Prompt actions" />
            )}
            sections={[
              {
                items: [
                  { label: "Edit prompt…", onSelect: onEdit },
                  { label: "Delete", danger: true, onSelect: () => setConfirmDelete(true) },
                ],
              },
            ]}
          />
        </div>
      </div>

      <div className="sched-body">
        <RunList runs={runs} activeId={active?.id ?? null} onSelect={selectRun} />
        {active ? (
          <RunViewer key={active.id} run={active} prompt={prompt} />
        ) : (
          <div className="sched-viewer">
            <div className="sched-viewer-note muted">
              {prompt.enabled && prompt.nextRunAt
                ? `No runs yet. The first is ${relative(prompt.nextRunAt, now)} — or start one now.`
                : "No runs yet. This prompt is paused: run it by hand, or resume its schedule."}
            </div>
            <PromptView prompt={prompt} />
          </div>
        )}
      </div>
    </div>
  );
}
