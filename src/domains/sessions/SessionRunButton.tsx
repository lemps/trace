import { I } from "@/components/Icon";
import { RestartChip } from "@/domains/agent/RestartChip";

interface SessionRunButtonProps {
  agentName: string;
  running: boolean;
  /** It ended on its own: offer a restart. */
  exited: boolean;
  /** It runs in a Vercel sandbox, where leaving it and stopping it differ. */
  remote: boolean;
  onStart: () => void;
  onStop: () => void;
  /** Leave a remote agent working and let go of it. */
  onDisconnect: () => void;
}

// A sandbox outlives trace, so a running one gets two exits that say what they
// do: Disconnect leaves Claude working there, Stop & save ends it and keeps the
// sandbox to resume. The session's terminal says the same as each happens.
const DISCONNECT =
  "Leave Claude working in its Vercel sandbox (until the plan's time limit). Start rejoins it.";
const STOP_AND_SAVE =
  "Stop Claude and save the sandbox: files, branch and conversation. Start resumes it.";
const START_REMOTE =
  "Joins the Vercel sandbox if it's still running, resumes it from where it was saved if it stopped, or starts a new one.";

// The header's run control for a session's agent: Stop while it runs (or, on
// Vercel, Disconnect and Stop & save), Restart once it has ended by itself,
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
  if (running && remote) {
    return (
      <>
        <button type="button" className="btn" onClick={onDisconnect} title={DISCONNECT}>
          Disconnect
        </button>
        <button type="button" className="btn" onClick={onStop} title={STOP_AND_SAVE}>
          <I.X size={13} /> Stop &amp; save
        </button>
      </>
    );
  }
  if (running) {
    return (
      <button type="button" className="btn" onClick={onStop}>
        <I.X size={13} /> Stop {agentName}
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
      <I.Bolt size={13} /> {remote ? "Start on Vercel" : `Start ${agentName}`}
    </button>
  );
}
