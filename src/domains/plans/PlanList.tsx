import { I } from "@/components/Icon";
import type { TaskList } from "@/ipc/plans";
import { type DocSeries, SOURCE_LABEL } from "./model";
import { shortTime } from "./time";

/** The list entry for the task list (it isn't a document). */
export const TASKS = "\u0000tasks";

interface PlanListProps {
  series: DocSeries[];
  tasks: TaskList | null;
  selected: string | null;
  onSelect: (series: string) => void;
}

// The tab's documents, newest first: title, where it came from (quietly) and when,
// and how many versions it has. The live task list, when there is one, leads.
export function PlanList({ series, tasks, selected, onSelect }: PlanListProps) {
  const items = tasks?.items ?? [];
  const done = items.filter((i) => i.status === "done").length;
  return (
    <nav className="pl-list" aria-label="Plans and documents">
      {items.length > 0 && (
        <button
          type="button"
          className={`pl-item${selected === TASKS ? " active" : ""}`}
          aria-current={selected === TASKS || undefined}
          onClick={() => onSelect(TASKS)}
        >
          <span className="pl-item-title">
            <I.ListChecks size={12} /> Task list
          </span>
          <span className="pl-item-meta">
            {done} of {items.length} done
          </span>
        </button>
      )}
      {series.map((s) => (
        <button
          key={s.series}
          type="button"
          className={`pl-item${selected === s.series ? " active" : ""}`}
          aria-current={selected === s.series || undefined}
          title={s.latest.title}
          onClick={() => onSelect(s.series)}
        >
          <span className="pl-item-title">
            {s.latest.format === "html" && <I.FileCode size={12} />}
            <span className="pl-item-name">{s.latest.title}</span>
          </span>
          <span className="pl-item-meta">
            {SOURCE_LABEL[s.latest.source]} · {shortTime(s.latest.createdAt)}
            {s.versions.length > 1 && <span className="pl-item-ver">v{s.latest.version}</span>}
          </span>
        </button>
      ))}
    </nav>
  );
}
