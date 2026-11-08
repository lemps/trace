import { useRef } from "react";
import { ContextMenu } from "@/components/ContextMenu";
import { I } from "@/components/Icon";
import { PopMenu } from "@/components/PopMenu";
import { TabMore } from "@/components/TabMore";
import { useContextMenuAt } from "@/components/useContextMenuAt";
import { useTabFit } from "@/components/useTabFit";
import { useAriaKeys, useHint } from "@/platform/shortcuts";
import { titleWithHint } from "@/platform/shortcuts/hintText";
import { ChatTab } from "./ChatTab";
import { useChatView } from "./chatContext";
import { chatTabMenu } from "./chatTabMenu";
import { closeSubagentTabs } from "./closedTabs";
import type { SubagentSummary } from "./hooks/useChat";
import { SubagentMark } from "./SubagentBits";

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
// brings it back. Right-click on any tab lists all it can do (`chatTabMenu`). The
// tabs the next/previous-tab keys would pick name them in their tooltips. When they
// don't all fit, the strip is measured (`useTabFit`): the tabs become their status
// marks, named in their tooltips, and past that the last ones move to a "more" menu.
export function ChatTabs({ subagents, inPanes, active, onPick }: ChatTabsProps) {
  const fitRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const fit = useTabFit(fitRef, moreRef, active);
  const rest = subagents.filter((s) => fit.out.includes(s.callId));
  const { workspaceId } = useChatView();
  const { menu, openAt, close: closeMenu } = useContextMenuAt<string>();
  const finished = subagents.filter(closable).map((s) => s.callId);
  const close = (callIds: string[]) => closeSubagentTabs(workspaceId, callIds);
  const describe = (s: SubagentSummary) =>
    `${s.label}${s.agentType ? ` (${s.agentType})` : ""}: ${stateOf(s)}, ${calls(s.toolCount)}`;
  const keys = useStepKeys(subagents, inPanes, active);
  return (
    <div className="ac-tabs" role="tablist" aria-label="Main chat and subagents">
      <div className="tab-fit" ref={fitRef}>
        <ChatTab
          id="main"
          name="Main"
          mode={fit.mode("main")}
          active={active}
          onPick={onPick}
          onContextMenu={openAt("main")}
          title={keys.title("main", "Main chat")}
          ariaKeys={keys.aria("main")}
        >
          <I.Chat size={13} />
          <span className="ac-tab-label" data-fit-label>
            Main
          </span>
        </ChatTab>
        {subagents.map((s) => (
          <ChatTab
            key={s.callId}
            id={s.callId}
            name={s.label}
            mode={fit.mode(s.callId)}
            active={active}
            onPick={onPick}
            onContextMenu={openAt(s.callId)}
            onClose={closable(s) ? () => close([s.callId]) : undefined}
            title={
              inPanes.has(s.callId)
                ? `${describe(s)} · open beside: click to go to it`
                : keys.title(s.callId, describe(s))
            }
            ariaKeys={keys.aria(s.callId)}
          >
            <SubagentMark status={s.status} pending={s.pending} />
            <span className="ac-tab-text" data-fit-label>
              <span className="ac-tab-label">{s.label}</span>
              <span className="tx-run-count">{s.toolCount}</span>
            </span>
            {inPanes.has(s.callId) && <I.SplitRight size={12} />}
          </ChatTab>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="tab-fit-more" ref={moreRef}>
          <PopMenu
            align="left"
            trigger={({ open, toggle }) => (
              <TabMore
                count={rest.length}
                open={open}
                toggle={toggle}
                className={`ac-tab${open ? " on" : ""}`}
              />
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
          onClose={closeMenu}
          sections={chatTabMenu({ workspaceId, tab: menu.target, finished })}
        />
      )}
    </div>
  );
}

/**
 * Which tab the next/previous-tab keys pick from here, so that tab's tooltip and
 * `aria-keyshortcuts` name the key ("Main chat (⇧⌘[)"), following rebinds. Subagents
 * open in a pane are stepped over, as the keys do (`useChatKeys`).
 */
function useStepKeys(subagents: SubagentSummary[], inPanes: ReadonlySet<string>, active: string) {
  const nextHint = useHint("chatNextTab");
  const prevHint = useHint("chatPrevTab");
  const nextAria = useAriaKeys("chatNextTab");
  const prevAria = useAriaKeys("chatPrevTab");
  const steppable = subagents.filter((s) => !inPanes.has(s.callId));
  const next = steppable.length > 0 ? stepTab(steppable, active, 1) : null;
  const prev = steppable.length > 0 ? stepTab(steppable, active, -1) : null;
  return {
    title: (id: string, label: string) =>
      titleWithHint(label, id === next ? nextHint : id === prev ? prevHint : ""),
    aria: (id: string) => (id === next ? nextAria : id === prev ? prevAria : undefined),
  };
}

/** The tab after (`step` 1) or before (-1) `active`, wrapping. */
export function stepTab(subagents: readonly SubagentSummary[], active: string, step: number) {
  const ids = ["main", ...subagents.map((s) => s.callId)];
  const at = Math.max(0, ids.indexOf(active));
  return ids[(at + step + ids.length) % ids.length];
}
