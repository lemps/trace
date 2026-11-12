import { useEffect, useState } from "react";

const UNIT_HOURS = { hours: 1, days: 24, weeks: 168 } as const;
type Unit = keyof typeof UNIT_HOURS;
const UNITS = Object.keys(UNIT_HOURS) as Unit[];
const isUnit = (v: string): v is Unit => (UNITS as string[]).includes(v);

/** Show a stored hour count in the largest unit that divides it evenly. */
function splitHours(hours: number): { amount: string; unit: Unit } {
  const unit: Unit = hours % 168 === 0 ? "weeks" : hours % 24 === 0 ? "days" : "hours";
  return { amount: String(hours / UNIT_HOURS[unit]), unit };
}

interface IdlePeriodFieldProps {
  /** The saved idle period. */
  hours: number;
  onSave: (hours: number) => void;
}

// Auto-cleanup's idle period: a number and its unit. The number saves on blur or
// Enter, not per keystroke: each save re-runs the preview (git in every worktree).
// A number that isn't a whole 1 or more goes back to what's saved.
export function IdlePeriodField({ hours, onSave }: IdlePeriodFieldProps) {
  const [amount, setAmount] = useState(() => splitHours(hours).amount);
  const [unit, setUnit] = useState<Unit>(() => splitHours(hours).unit);

  // Follow what was stored (the backend clamps it).
  useEffect(() => {
    const split = splitHours(hours);
    setAmount(split.amount);
    setUnit(split.unit);
  }, [hours]);

  const commit = (nextAmount: string, nextUnit: Unit) => {
    const n = Number.parseInt(nextAmount, 10);
    const next = Number.isFinite(n) && n >= 1 ? n * UNIT_HOURS[nextUnit] : null;
    if (next === null) {
      setAmount(splitHours(hours).amount);
      setUnit(splitHours(hours).unit);
    } else if (next !== hours) {
      onSave(next);
    }
  };

  return (
    <div className="cleanup-period">
      <input
        type="number"
        min={1}
        aria-label="Idle period"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => commit(amount, unit)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(amount, unit);
        }}
      />
      <select
        aria-label="Idle period unit"
        value={unit}
        onChange={(e) => {
          if (!isUnit(e.target.value)) return;
          setUnit(e.target.value);
          commit(amount, e.target.value);
        }}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}
