import { AgentAvatar } from "@/components/AgentAvatar";
import { FilterChip } from "@/components/FilterChip";
import type { Assignee, Issue } from "@/domains/issues/types";

// Unique assignees across the board's issues, alphabetical.
function uniqueAssignees(issues: Issue[]): Assignee[] {
  const map = new Map<string, Assignee>();
  for (const i of issues) {
    if (i.assignee?.accountId) map.set(i.assignee.accountId, i.assignee);
  }
  return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

interface AssigneeFilterProps {
  issues: Issue[];
  /** null = all assignees */
  selected: string | null;
  onSelect: (accountId: string | null) => void;
}

// Jira-style avatar row: click a face to filter the board to that assignee,
// click it again (or Everyone) to clear. Hidden when the board has a single person.
// "Everyone", not "All": the state chips beside it start with their own All.
export function AssigneeFilter({ issues, selected, onSelect }: AssigneeFilterProps) {
  const people = uniqueAssignees(issues);
  if (people.length <= 1) return null;

  return (
    <div className="assignee-filter">
      <FilterChip active={selected === null} onClick={() => onSelect(null)}>
        Everyone
      </FilterChip>
      {people.map((p) => (
        <button
          key={p.accountId}
          type="button"
          className="af-av"
          aria-pressed={selected === p.accountId}
          aria-label={p.displayName}
          onClick={() => onSelect(selected === p.accountId ? null : p.accountId)}
          title={p.displayName}
        >
          <AgentAvatar assignee={p} />
        </button>
      ))}
    </div>
  );
}
