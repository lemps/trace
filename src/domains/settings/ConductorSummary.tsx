import { I } from "@/components/Icon";
import type { ConductorReport, ConductorReportItem } from "@/ipc/conductorImport";

// Step 4 of the Conductor import: what came over, and what didn't and why.

function Items({ items }: { items: ConductorReportItem[] }) {
  return (
    <ul className="ci-report">
      {items.map((it, i) => (
        // Items can repeat a name (a repo and its run script), so the index keys them.
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, never reordered
        <li key={i}>
          <span className="ci-row-title">{it.item}</span>
          <span className="ci-row-sub">{it.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function ConductorSummary({ report }: { report: ConductorReport }) {
  return (
    <div className="ci-preview">
      <section className="ci-section">
        <div className="ci-label">
          <I.Check size={12} /> Imported
        </div>
        {report.imported.length === 0 ? (
          <div className="ci-empty">Nothing was imported.</div>
        ) : (
          <Items items={report.imported} />
        )}
      </section>
      {report.skipped.length > 0 && (
        <section className="ci-section">
          <div className="ci-label">Not imported</div>
          <Items items={report.skipped} />
        </section>
      )}
      <div className="ci-muted">
        Conductor's database stays where it was. Anyone on this computer can read it, and it keeps
        the environment variables you gave Conductor (cloud credentials, for some). Once you're
        happy with the import, consider deleting it, or running chmod 600 on it.
      </div>
    </div>
  );
}
