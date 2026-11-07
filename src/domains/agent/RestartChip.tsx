import { I } from "@/components/Icon";
import { StatusLight } from "@/components/StatusLight";

interface RestartChipProps {
  /** Who restarts ("Claude", "codex", "kimi · wafer"). */
  agentName: string;
  onRestart: () => void;
}

// What a detail header shows once its agent has exited on its own: the stopped light,
// worded "Exited", and one click to bring it back on the same conversation.
export function RestartChip({ agentName, onRestart }: RestartChipProps) {
  return (
    <>
      <StatusLight light="stopped" label="Exited" variant="pill" size="lg" />
      <button
        type="button"
        className="btn primary"
        onClick={onRestart}
        title="Start it again on the same conversation"
      >
        <I.Refresh size={13} /> Restart {agentName}
      </button>
    </>
  );
}
