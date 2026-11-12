import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { sandboxSize, setSandboxSize } from "@/ipc/vercel";

// Vercel gives a sandbox 2 GB of memory per vCPU, so the choice is a vCPU count shown as memory.
const SIZES = [1, 2, 4, 8, 16];
const DEFAULT = "default";

function label(vcpus: number): string {
  return `${vcpus * 2} GB memory · ${vcpus} vCPU${vcpus === 1 ? "" : "s"}`;
}

// Vercel's "Sandbox size": how much memory a new sandbox gets. Existing sandboxes keep the
// size they were made with; this applies from the next one.
export function SandboxSize() {
  const [vcpus, setVcpus] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    sandboxSize()
      .then((s) => setVcpus(s.vcpus))
      .catch(() => {});
  }, []);

  const choose = (value: string) => {
    const next = value === DEFAULT ? null : Number.parseInt(value, 10);
    setSandboxSize(next)
      .then((s) => setVcpus(s.vcpus))
      .catch((err) => toast.error(`Couldn't save: ${String(err)}`));
  };

  if (vcpus === undefined) return null;
  const sizes =
    vcpus !== null && !SIZES.includes(vcpus) ? [...SIZES, vcpus].sort((a, b) => a - b) : SIZES;
  return (
    <section className="ig-sub">
      <h3>Sandbox size</h3>
      <div className="field">
        <label htmlFor="sandbox-size">Memory for new sandboxes</label>
        <select
          id="sandbox-size"
          value={vcpus === null ? DEFAULT : String(vcpus)}
          onChange={(e) => choose(e.target.value)}
        >
          <option value={DEFAULT}>Vercel's default</option>
          {sizes.map((n) => (
            <option key={n} value={n}>
              {label(n)}
            </option>
          ))}
        </select>
        <span className="hint">
          Hobby allows up to 8 GB, Pro up to 16 GB. Sandboxes already made keep their size.
        </span>
      </div>
    </section>
  );
}
