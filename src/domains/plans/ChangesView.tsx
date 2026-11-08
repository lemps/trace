import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { DiffLines } from "@/domains/agentChat/DiffCard";
import type { DiffLine } from "@/domains/agentChat/lineDiff";
import type { PlanDoc } from "@/ipc/plans";
import { shortTime } from "./time";

interface ChangesViewProps {
  lines: DiffLine[];
  stat: { added: number; removed: number };
  base: PlanDoc;
  doc: PlanDoc;
  /** Versions before `doc`, any of which it can be compared with. */
  earlier: PlanDoc[];
  onPickBase: (id: string) => void;
}

// What changed in a plan between two versions: its Markdown, line by line, in the
// diff colours the chat's file changes use.
export function ChangesView({ lines, stat, base, doc, earlier, onPickBase }: ChangesViewProps) {
  return (
    <div className="pl-body">
      <div className="pl-changes-head">
        <span>v{doc.version} against</span>
        <PopMenu
          align="left"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="btn pl-ver-btn"
              aria-haspopup="menu"
              aria-expanded={open}
              title="Compare with another version"
              onClick={toggle}
            >
              v{base.version} <I.Chevron size={12} />
            </button>
          )}
          sections={[
            {
              title: "Compare with",
              items: [...earlier].reverse().map((v) => ({
                id: v.id,
                label: `v${v.version} · ${shortTime(v.createdAt)}`,
                checked: v.id === base.id,
                onSelect: () => onPickBase(v.id),
              })),
            },
          ]}
        />
        <span className="ac-diff-stat">
          {stat.added > 0 && <span className="add">+{stat.added}</span>}
          {stat.removed > 0 && <span className="del">−{stat.removed}</span>}
          {stat.added + stat.removed === 0 && "No changes"}
        </span>
      </div>
      <div className="ac-diff open pl-diff">
        <DiffLines lines={lines} />
      </div>
    </div>
  );
}
