import { useEffect, useRef } from "react";
import { toast } from "@/app/toast";
import { I, ICON_SIZE } from "@/components/Icon";
import { useBoardStore } from "@/domains/board/store";
import { startTerminal } from "@/ipc/agent";
import { PtyTerminal } from "./PtyTerminal";
import { fitTerminal, resetTerminal, syncPtySize } from "./terminalRegistry";

// The "Terminal" tab — a plain shell in the issue's worktree, distinct from the
// Claude agent in Chat. Keyed `term:<issue>` so the two PTYs coexist. Reuses the
// same live-terminal/registry machinery as the agent. The tab shows only while a
// shell is open; picked from the pane menu, it mounts with `autoStart` and opens one.

export function TerminalPane({ issueKey, autoStart }: { issueKey: string; autoStart?: boolean }) {
  const termKey = `term:${issueKey}`;
  const running = useBoardStore((s) => s.runningAgents.has(termKey));
  const setAgentRunning = useBoardStore((s) => s.setAgentRunning);
  const clearOutput = useBoardStore((s) => s.clearOutput);
  const startingRef = useRef(false);

  const start = async () => {
    if (startingRef.current || running) return;
    startingRef.current = true;
    const size = fitTerminal(termKey) ?? { cols: 80, rows: 24 };
    clearOutput(termKey);
    resetTerminal(termKey);
    try {
      await startTerminal(issueKey, size.cols, size.rows);
      setAgentRunning(termKey, true);
      // The pane may have resized while the spawn was in flight.
      syncPtySize(termKey);
    } catch (e) {
      toast.error(`Couldn't open a terminal: ${String(e)}`);
    } finally {
      startingRef.current = false;
    }
  };
  // After a frame, so the terminal is laid out and the shell spawns at its real size.
  const autoStarted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: start once, on the first mount asked to
  useEffect(() => {
    if (!autoStart || autoStarted.current || running) return;
    // Marked in the frame, not before: StrictMode's re-run cancels the first one.
    const frame = requestAnimationFrame(() => {
      autoStarted.current = true;
      void start();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoStart]);

  return (
    <div className="pty-host-wrap">
      <PtyTerminal issueKey={termKey} />
      {running ? null : (
        <div className="empty-state">
          <div className="inner">
            <span className="ic">
              <I.Terminal size={ICON_SIZE.empty} />
            </span>
            <div className="title">Open a shell in this workspace</div>
            <div className="hint">
              A plain terminal rooted in this workspace's worktree — the same place its agent runs,
              separate from the agent in Chat. Run git, build, or test commands here.
            </div>
            <button type="button" className="btn empty-action" onClick={start}>
              <I.Terminal size={14} /> Open terminal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
