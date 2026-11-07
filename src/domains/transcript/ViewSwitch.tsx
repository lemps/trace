import type { AgentCli } from "@/ipc/agent";
import { useTitleWithHint } from "@/platform/shortcuts";
import { type AgentView, useAgentView, useTranscriptStore } from "./store";

const OPTIONS: { value: AgentView; label: string }[] = [
  { value: "transcript", label: "Transcript" },
  { value: "terminal", label: "Terminal" },
];

// Transcript | Terminal for the agent in view, at the right end of its tab bar.
// Both show the same running agent; switching never restarts it.
export function ViewSwitch({ workspaceId, cli }: { workspaceId: string; cli: AgentCli }) {
  const view = useAgentView(workspaceId);
  const switchTitle = useTitleWithHint("Switch between transcript and terminal", "agentView");
  const setView = useTranscriptStore((s) => s.setView);
  const isCodex = cli === "codex";
  const shown = isCodex ? "terminal" : view;
  return (
    <fieldset
      className="seg tx-switch"
      aria-label="Agent view"
      title={isCodex ? "Codex agents show the terminal only" : switchTitle}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={shown === o.value}
          className={shown === o.value ? "on" : undefined}
          disabled={isCodex && o.value === "transcript"}
          onClick={() => setView(workspaceId, o.value)}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}
