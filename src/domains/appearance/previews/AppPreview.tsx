import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";

// Settings → Appearance → Theme: a miniature trace window — title bar, rail,
// a page header with buttons, agent rows — drawn with the real tokens and
// controls, so it shows the theme, accent and density exactly as they apply.
// It's a picture: `inert` keeps its controls out of the tab order.

const ROWS = [
  {
    key: "TRACE-128",
    title: "Fix flaky board test",
    light: "attention" as const,
    label: "Question",
  },
  { key: "TRACE-131", title: "Chat Markdown styles", light: "working" as const, label: undefined },
  { key: "TRACE-119", title: "Windows installer", light: "ready" as const, label: undefined },
];

export function AppPreview() {
  return (
    <div className="ap-win" inert aria-hidden="true">
      <div className="ap-win-title">
        <span>trace</span>
        <span className="ap-win-ctrls">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="ap-win-body">
        <div className="ap-win-rail">
          <span>
            <I.Board size={14} />
          </span>
          <span className="on">
            <I.Agents size={14} />
          </span>
          <span>
            <I.Inbox size={14} />
          </span>
          <span className="ap-win-rail-end">
            <I.Settings size={14} />
          </span>
        </div>
        <div className="ap-win-main">
          <div className="ap-win-head">
            <span className="ap-win-h1">Sessions</span>
            <button type="button" className="btn">
              Filter
            </button>
            <button type="button" className="btn primary">
              <I.Plus size={13} /> New
            </button>
          </div>
          {ROWS.map((r, i) => (
            <div key={r.key} className={`ap-win-row${i === 1 ? " on" : ""}`}>
              <span className="ap-win-key">{r.key}</span>
              <span className="ap-win-row-title">{r.title}</span>
              <StatusLight light={r.light} variant="pill" label={r.label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
