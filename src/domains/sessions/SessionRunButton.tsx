import { useEffect, useState } from "react";
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
// Start otherwise.
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
  if (running && remote && saving) {
    return (
      <button type="button" className="btn" disabled aria-busy="true" title={STOP_AND_SAVE}>
        <Spinner /> Saving…
      </button>
    );
  }
  if (running && remote) {
    return (
      <>
        <button type="button" className="btn" onClick={onDisconnect} title={LEAVE_RUNNING}>
          Leave running
        </button>
        <button type="button" className="btn" onClick={stopAndSave} title={STOP_AND_SAVE}>
          <I.Stop size={13} /> Stop &amp; save
        </button>
      </>
    );
  }
  if (running) {
    return (
      <button type="button" className="btn" onClick={onStop}>
        <I.Stop size={13} /> Stop agent
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
      <I.Play size={13} /> {remote ? "Start in sandbox" : `Start ${agentName}`}
    </button>
  );
}
