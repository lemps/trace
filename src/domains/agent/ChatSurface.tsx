import { type ReactNode, useEffect, useRef } from "react";
import { useAgentView, useTranscriptStore } from "@/domains/transcript/store";
import { TranscriptView } from "@/domains/transcript/TranscriptView";
import type { AgentCli } from "@/ipc/agent";
import { isAgentViewKey } from "@/platform/shortcuts";
import { AnswerBar } from "./AnswerBar";
import { PtyTerminal } from "./PtyTerminal";
import { getTerminal } from "./terminalRegistry";

interface ChatSurfaceProps {
  workspaceId: string;
  cli: AgentCli;
  /**
   * The start prompt, while the agent is stopped. It covers the terminal, and the
   * transcript only until there's a conversation to read — a stopped agent's
   * transcript stays readable (the header still has Start).
   */
  children?: ReactNode;
}

// An agent's chat pane: the live terminal, with its formatted transcript laid
// over it when that view is picked. The terminal stays mounted and sized
// underneath, so flipping views never restarts, resizes or repaints the agent.
// ⌘⇧T (Ctrl+Shift+T) flips; the answer bar works in both.
export function ChatSurface({ workspaceId, cli, children }: ChatSurfaceProps) {
  const view = useAgentView(workspaceId);
  const showTranscript = view === "transcript" && cli !== "codex";
  const hasTranscript = useTranscriptStore((s) => (s.feeds[workspaceId]?.items.length ?? 0) > 0);
  const wrapRef = useRef<HTMLDivElement>(null);
  useAgentViewKey(workspaceId, cli);

  // Keys follow what's shown: typing into a terminal you can't see would send
  // keystrokes to the agent blind.
  useEffect(() => {
    const term = getTerminal(workspaceId).term;
    if (showTranscript) {
      term.blur();
      wrapRef.current?.querySelector<HTMLElement>(".tx-scroll")?.focus();
    } else if (wrapRef.current?.contains(document.activeElement)) {
      term.focus();
    }
  }, [showTranscript, workspaceId]);

  return (
    <>
      <div className="pty-host-wrap" ref={wrapRef}>
        <PtyTerminal issueKey={workspaceId} />
        {showTranscript && (
          <div className="tx-cover">
            <TranscriptView workspaceId={workspaceId} cli={cli} />
          </div>
        )}
        {(!showTranscript || !hasTranscript) && children}
      </div>
      <AnswerBar workspaceId={workspaceId} />
    </>
  );
}

/** ⌘⇧T flips this agent between its transcript and terminal (codex has only the terminal). */
function useAgentViewKey(workspaceId: string, cli: AgentCli): void {
  const ref = useRef({ workspaceId, cli });
  ref.current = { workspaceId, cli };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isAgentViewKey(e)) return;
      const { workspaceId, cli } = ref.current;
      if (cli === "codex") return;
      e.preventDefault();
      const { views, preferred, setView } = useTranscriptStore.getState();
      const current = views[workspaceId] ?? preferred;
      setView(workspaceId, current === "transcript" ? "terminal" : "transcript");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
