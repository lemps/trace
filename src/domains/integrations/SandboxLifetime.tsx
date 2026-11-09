import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import {
  type SandboxLifetime as Lifetime,
  sandboxLifetime,
  setSandboxLifetime,
} from "@/ipc/vercel";

// Vercel's "Unattended sandboxes": how long a sandbox waits idle before stopping (and
// saving, for Start to resume), and the longest one run lasts. Each sandbox keeps
// itself to these (`trace-keepalive`), with trace open or not, from its next start.
export function SandboxLifetime() {
  const [saved, setSaved] = useState<Lifetime | null>(null);
  const [draft, setDraft] = useState({ idle: "", max: "" });

  useEffect(() => {
    sandboxLifetime()
      .then((l) => {
        setSaved(l);
        setDraft({ idle: String(l.idleMinutes), max: String(l.maxHours) });
      })
      .catch(() => {});
  }, []);

  const save = () => {
    const idle = Number.parseInt(draft.idle, 10);
    const max = Number.parseInt(draft.max, 10);
    if (!saved || Number.isNaN(idle) || Number.isNaN(max)) return;
    if (idle === saved.idleMinutes && max === saved.maxHours) return;
    setSandboxLifetime(idle, max)
      .then((l) => {
        setSaved(l);
        setDraft({ idle: String(l.idleMinutes), max: String(l.maxHours) });
      })
      .catch((err) => toast.error(`Couldn't save: ${String(err)}`));
  };

  if (!saved) return null;
  return (
    <section className="ig-sub">
      <h3>Unattended sandboxes</h3>
      <div className="ig-note">
        A sandbox keeps itself running while its agent works, with trace open or closed, and stops
        once there's nothing to do. Stopping saves it: Start picks up where it left off.
      </div>
      <div className="field">
        <label htmlFor="sandbox-idle">Stop after idle (minutes)</label>
        <input
          id="sandbox-idle"
          className="ig-number"
          type="number"
          min={1}
          max={120}
          value={draft.idle}
          onChange={(e) => setDraft((d) => ({ ...d, idle: e.target.value }))}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <span className="hint">No turn running, nothing in the background, nobody watching.</span>
      </div>
      <div className="field">
        <label htmlFor="sandbox-max">Longest run (hours)</label>
        <input
          id="sandbox-max"
          className="ig-number"
          type="number"
          min={1}
          max={24}
          value={draft.max}
          onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <span className="hint">
          Up to 24 on Pro. Hobby stops every sandbox at 45 minutes whatever this says.
        </span>
      </div>
    </section>
  );
}
