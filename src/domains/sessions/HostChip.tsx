import type { SessionHost } from "./types";

/**
 * Where a session runs when it isn't this computer: "Vercel", in a chip of its
 * own (`.session-host`) so it reads as a place, not an agent type like Codex.
 * Its tooltip says what being there means for leaving and stopping it.
 */
export function HostChip({ host }: { host: SessionHost }) {
  const title = `Runs in the Vercel Sandbox ${host.sandbox}, not on this computer. Leave running keeps Claude working there; Stop & save ends it and keeps a snapshot for Start to resume.`;
  return (
    <span className="session-host" title={title}>
      Vercel
    </span>
  );
}
