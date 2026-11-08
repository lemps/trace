import { useEffect, useState } from "react";
import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";
import { RestartChip } from "@/domains/agent/RestartChip";

interface SessionRunButtonProps {
  agentName: string;
  running: boolean;
  /** It ended on its own: offer a restart. */
  exited: boolean;
  /** It runs in a Vercel sandbox, where leaving it and stopping it differ. */
  remote: boolean;
  onStart: () => void;
  onStop: () => void | Promise<void>;
  /** Leave a remote agent working and let go of it. */
  onDisconnect: () => void;
}

// A sandbox outlives trace, so a running one gets two exits that say what they
// do: Leave running keeps Claude working there, Stop & save ends it and keeps the
// sandbox to resume. The session's terminal says the same as each happens.
const LEAVE_RUNNING =
  "Leave Claude working in its Vercel Sandbox (until the plan's time limit). Start joins it again.";
const STOP_AND_SAVE =
  "Stop Claude and save the sandbox: files, branch and conversation. Start resumes it.";
const START_REMOTE =
  "Joins this session's Vercel Sandbox if it's still running, resumes the sandbox from where it was saved if it stopped, or starts a new one.";

// The header's run control for a session's agent: Stop while it runs (or, on
// Vercel, Leave running and Stop & save), Restart once it has ended by itself,
// Start otherwise. Stop drops to its icon when the header is narrow
// (`header-fit.css`); the sandbox pair keep their words, which tell them apart.
export function SessionRunButton({
  agentName,
  running,
  exited,
  remote,
  onStart,
  onStop,
  onDisconnect,
}: SessionRunButtonProps) {
  // Saving a sandbox takes seconds; the button says so until the agent's gone.
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!running) setSaving(false);
  }, [running]);
  const stopAndSave = () => {
    setSaving(true);
    void Promise.resolve(onStop()).catch(() => setSaving(false));
  };
  if (running && remote) {
    // Saving keeps both in place, disabled, with the verb in Stop & save's own width.
    return (
      <>
        <button
          type="button"
          className="btn"
          onClick={onDisconnect}
          disabled={saving}
          title={LEAVE_RUNNING}
        >
          Leave running
        </button>
        <button
          type="button"
          className="btn"
          onClick={stopAndSave}
          disabled={saving}
          aria-busy={saving}
          title={STOP_AND_SAVE}
        >
          {saving ? <Spinner size={14} /> : <I.Stop size={14} />}
          <BusyLabel busy={saving} idle="Stop & save" working="Saving…" />
        </button>
      </>
    );
  }
  if (running) {
    return (
      <button type="button" className="btn fit" onClick={onStop} title="Stop the agent">
        <I.Stop size={14} />
        <span className="fit-label">Stop</span>
      </button>
    );
  }
  if (exited) return <RestartChip agentName={agentName} onRestart={onStart} />;
  return (
    <button
      type="button"
      className="btn primary"
      onClick={onStart}
      title={remote ? START_REMOTE : undefined}
    >
      <I.Play size={14} /> {remote ? "Start in sandbox" : `Start ${agentName}`}
    </button>
  );
}
