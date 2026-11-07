import type { ReactNode } from "react";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { useHint } from "@/platform/shortcuts";
import type { SubagentSummary } from "./hooks/useChat";
import { SubagentMark } from "./SubagentBits";

interface ChatTabsProps {
  subagents: SubagentSummary[];
  /** `"main"`, or the call id of the subagent shown. */
  active: string;
  onPick: (tab: string) => void;
}

/** Subagent tabs shown at once; the rest are in the "more" menu. */
const SHOWN = 5;

const WORDS = { running: "running", done: "done", failed: "failed", stopped: "stopped" };

// Main, then one tab per subagent this conversation started, in the order they
// started (a tab never moves; its mark changes). Past `SHOWN`, the newest are
// tabs and older ones are a menu away, as is the one you picked from it.
export function ChatTabs({ subagents, active, onPick }: ChatTabsProps) {
  const next = useHint("chatNextTab");
  let shown = subagents.slice(-SHOWN);
  const picked = subagents.find((s) => s.callId === active);
  if (picked && !shown.includes(picked)) shown = [picked, ...shown.slice(1)];
  const rest = subagents.filter((s) => !shown.includes(s));
  return (
    <div className="ac-tabs" role="tablist" aria-label="Main chat and subagents">
      <Tab id="main" active={active} onPick={onPick} title={`Main chat (${next} for the next tab)`}>
        <I.Chat size={13} />
        <span className="ac-tab-label">Main</span>
      </Tab>
      {shown.map((s) => (
        <Tab
          key={s.callId}
          id={s.callId}
          active={active}
          onPick={onPick}
          title={`${s.label}: ${WORDS[s.status]}, ${s.toolCount} calls`}
        >
          <SubagentMark status={s.status} pending={s.pending} />
          <span className="ac-tab-label">{s.label}</span>
          <span className="tx-run-count">{s.toolCount}</span>
        </Tab>
      ))}
      {rest.length > 0 && (
        <PopMenu
          align="left"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className={`ac-tab more${open ? " on" : ""}`}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={toggle}
            >
              {rest.length} more <I.Chevron size={11} />
            </button>
          )}
          sections={[
            {
              title: "Earlier subagents",
              items: rest.map((s) => ({
                id: s.callId,
                label: `${s.label} · ${WORDS[s.status]} · ${s.toolCount} calls`,
                checked: s.callId === active,
                onSelect: () => onPick(s.callId),
              })),
            },
          ]}
        />
      )}
    </div>
  );
}

function Tab({
  id,
  active,
  onPick,
  title,
  children,
}: {
  id: string;
  active: string;
  onPick: (tab: string) => void;
  title: string;
  children: ReactNode;
}) {
  const on = id === active;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={`ac-tab${on ? " on" : ""}`}
      onClick={() => onPick(id)}
      title={title}
    >
      {children}
    </button>
  );
}

/** The tab after (`step` 1) or before (-1) `active`, wrapping. */
export function stepTab(subagents: readonly SubagentSummary[], active: string, step: number) {
  const ids = ["main", ...subagents.map((s) => s.callId)];
  const at = Math.max(0, ids.indexOf(active));
  return ids[(at + step + ids.length) % ids.length];
}
