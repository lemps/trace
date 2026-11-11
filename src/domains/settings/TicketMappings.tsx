import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { InlineConfirm } from "@/components/InlineConfirm";
import { basename } from "@/platform/paths";
import { SettingSection } from "./SettingSection";
import type { MappingRow } from "./useRepoSettings";

interface TicketMappingsProps {
  repos: string[];
  mappings: MappingRow[];
  onChange: (next: MappingRow[]) => void;
  onAdd: () => void;
}

const DESC =
  "Tickets whose key contains a pattern use that repository; the first match wins. Others ask once and remember.";

// Ticket → repo rules. Always on the page: with one repository there's nothing to
// route, so it says how to make it useful instead of coming and going. Rows are
// matched by id, so typing in one never remounts another. A blank row lives only
// here (the backend drops it until it has a pattern), so it goes without a confirm.
export function TicketMappings({ repos, mappings, onChange, onAdd }: TicketMappingsProps) {
  const routable = repos.length > 1;
  const patch = (id: string, change: Partial<MappingRow>) =>
    onChange(mappings.map((m) => (m.id === id ? { ...m, ...change } : m)));
  const drop = (id: string) => onChange(mappings.filter((m) => m.id !== id));

  return (
    <SettingSection
      title="Ticket mapping"
      desc={DESC}
      actions={
        <button
          type="button"
          className="btn sm"
          disabled={!routable}
          title={routable ? undefined : "Needs two or more repositories"}
          onClick={onAdd}
        >
          <I.Plus size={14} /> Add mapping
        </button>
      }
    >
      {!routable ? (
        <div className="rs-note">Add a second repository to route tickets by key.</div>
      ) : mappings.length === 0 ? (
        <div className="rs-note">No mappings yet.</div>
      ) : (
        <div className="rs-maps">
          {mappings.map((m) => (
            <div key={m.id} className="rs-map">
              <input
                type="text"
                aria-label="Ticket pattern"
                placeholder="e.g. TRACE"
                spellCheck={false}
                value={m.pattern}
                onChange={(e) => patch(m.id, { pattern: e.target.value })}
              />
              <select
                aria-label="Repository for this pattern"
                value={m.repo}
                onChange={(e) => patch(m.id, { repo: e.target.value })}
              >
                {repos.map((r) => (
                  <option key={r} value={r}>
                    {basename(r)}
                  </option>
                ))}
              </select>
              {m.pattern.trim() ? (
                <InlineConfirm
                  label={<I.Trash size={14} />}
                  className="btn ghost icon sm"
                  size="sm"
                  ariaLabel="Remove mapping"
                  message={`Remove the ${m.pattern.trim()} mapping?`}
                  confirmLabel="Remove"
                  onConfirm={() => drop(m.id)}
                />
              ) : (
                <IconButton
                  size="sm"
                  className="ghost"
                  label="Remove mapping"
                  onClick={() => drop(m.id)}
                >
                  <I.Trash size={14} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingSection>
  );
}
