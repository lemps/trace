import { Fragment, type MouseEvent, type ReactNode, useRef, useState } from "react";
import { ContextMenu } from "@/components/ContextMenu";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { fitClass, type TabFitMode, useTabFit } from "@/components/useTabFit";
import { useChatView } from "./chatContext";
import { closeSubagentTabs } from "./closedTabs";
import type { SubagentSummary } from "./hooks/useChat";
import { SubagentMark } from "./SubagentBits";
import { openSubagentBeside } from "./subagentPanel";

interface ChatTabsProps {
  subagents: SubagentSummary[];
  /** Subagents open in a pane of their own: picking one goes to its pane. */
  inPanes: ReadonlySet<string>;
  /** `"main"`, or the call id of the subagent shown. */
  active: string;
  onPick: (tab: string) => void;
}

/** How a subagent is doing, in its tooltip: the agent-state words, then the ends. */
const WORDS = { running: "working", done: "done", failed: "failed", stopped: "stopped" };
const stateOf = (s: SubagentSummary) => (s.pending ? "needs you" : WORDS[s.status]);
const calls = (n: number) => `${n} ${n === 1 ? "call" : "calls"}`;
/** A subagent still going (or waiting on you) keeps its tab; a finished one can close. */
const closable = (s: SubagentSummary) => s.status !== "running" && !s.pending;

// Main, then one tab per subagent this conversation started, in the order they
// started (a tab never moves; its mark changes). A finished subagent's tab has a
// × (or middle-click, or its menu); closing only hides it, and its card in Main
// brings it back. When they don't all fit, the
// strip is measured (`useTabFit`): the tabs become their status marks, named in
// their tooltips, and past that the last ones move to a "more" menu.
export function ChatTabs({ subagents, inPanes, active, onPick }: ChatTabsProps) {
  const fitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fit = useTabFit(fitRef, moreRef, active);
  const rest = subagents.filter((s) => fit.out.includes(s.callId));
  const { workspaceId } = useChatView();
  const [menu, setMenu] = useState<{ callId: string; x: number; y: number } | null>(null);
  const openMenu = (callId: string) => (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const keyboard = e.clientX === 0 && e.clientY === 0;
    setMenu({ callId, x: keyboard ? r.left : e.clientX, y: keyboard ? r.bottom : e.clientY });
  };
  const finished = subagents.filter(closable).map((s) => s.callId);
  const close = (callIds: string[]) => closeSubagentTabs(workspaceId, callIds);
  const describe = (s: SubagentSummary) =>
    `${s.label}${s.agentType ? ` (${s.agentType})` : ""}: ${stateOf(s)}, ${calls(s.toolCount)}`;
  return (
    <div className="ac-tabs" role="tablist" aria-label="Main chat and subagents">
      <div className="tab-fit" ref={fitRef}>
        <Tab
          id="main"
          name="Main"
          mode={fit.mode("main")}
          active={active}
          onPick={onPick}
          title="Main chat"
        >
          <I.Chat size={13} />
          <span className="ac-tab-label" data-fit-label>
            Main
          </span>
        </Tab>
        {subagents.map((s) => (
          <Tab
            key={s.callId}
            id={s.callId}
            name={s.label}
            mode={fit.mode(s.callId)}
            active={active}
            onPick={onPick}
            onContextMenu={openMenu(s.callId)}
            onClose={closable(s) ? () => close([s.callId]) : undefined}
            title={
              inPanes.has(s.callId)
                ? `${describe(s)} (open beside: click to go to it)`
                : `${describe(s)} (right-click to open beside)`
            }
          >
            <SubagentMark status={s.status} pending={s.pending} />
            <span className="ac-tab-text" data-fit-label>
              <span className="ac-tab-label">{s.label}</span>
              <span className="tx-run-count">{s.toolCount}</span>
            </span>
            {inPanes.has(s.callId) && <I.SplitRight size={12} />}
          </Tab>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="tab-fit-more" ref={moreRef}>
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
                title: "More subagents",
                items: rest.map((s) => ({
                  id: s.callId,
                  label: `${s.label} · ${stateOf(s)} · ${calls(s.toolCount)}`,
                  checked: s.callId === active,
                  onSelect: () => onPick(s.callId),
                })),
              },
            ]}
          />
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          sections={[
            {
              items: [
                {
                  label: "Open beside",
                  onSelect: () => openSubagentBeside(workspaceId, menu.callId),
                },
              ],
            },
            {
              items: [
                {
                  label: "Close",
                  disabled: !finished.includes(menu.callId),
                  onSelect: () => close([menu.callId]),
                },
                {
                  label: "Close finished tabs",
                  disabled: finished.length === 0,
                  onSelect: () => close(finished),
                },
              ],
            },
          ]}
        />
      )}
    </div>
  );
}

function Tab({
  id,
  name,
  mode,
  active,
  onPick,
  title,
  onContextMenu,
  onClose,
  children,
}: {
  id: string;
  /** Its full name, for screen readers whether or not the label shows. */
  name: string;
  mode: TabFitMode;
  active: string;
  onPick: (tab: string) => void;
  title: string;
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Set when the tab can close: a × beside it, and middle-click. */
  onClose?: () => void;
  children: ReactNode;
}) {
  const on = id === active;
  const out = mode === "out";
  return (
    <Fragment>
      <button
        type="button"
        role="tab"
        data-fit-tab={id}
        aria-selected={on}
        aria-label={name}
        aria-hidden={mode === "out" || undefined}
        tabIndex={mode === "out" ? -1 : undefined}
        className={`ac-tab${on ? " on" : ""}${fitClass(mode)}`}
        onClick={() => onPick(id)}
        onAuxClick={(e) => {
          if (e.button !== 1 || !onClose) return;
          e.preventDefault();
          onClose();
        }}
        onContextMenu={onContextMenu}
        title={title}
      >
        {children}
      </button>
      {onClose && (
        <button
          type="button"
          className={`ac-tab-close${fitClass(mode)}`}
          data-fit-of={id}
          tabIndex={out ? -1 : undefined}
          aria-hidden={out || undefined}
          aria-label={`Close ${name}`}
          title={`Close ${name}`}
          onClick={onClose}
        >
          <I.X size={11} />
        </button>
      )}
    </Fragment>
  );
}

/** The tab after (`step` 1) or before (-1) `active`, wrapping. */
export function stepTab(subagents: readonly SubagentSummary[], active: string, step: number) {
  const ids = ["main", ...subagents.map((s) => s.callId)];
  const at = Math.max(0, ids.indexOf(active));
  return ids[(at + step + ids.length) % ids.length];
}
