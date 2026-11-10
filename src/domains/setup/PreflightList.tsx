import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { type PreflightCheck, requiredProblems } from "./checks";
import { useSetupStore } from "./store";

function CheckRow({ check }: { check: PreflightCheck }) {
  const tone = check.ok ? "ok" : check.required ? "bad" : "optional";
  return (
    <li className={`su-check ${tone}`}>
      <span className="su-check-ic" aria-hidden="true">
        {check.ok ? <I.Check size={14} /> : <I.X size={14} />}
      </span>
      <div className="su-check-body">
        <div className="su-check-title">
          {check.title}
          {!check.ok && !check.required && <span className="su-optional">Optional</span>}
        </div>
        <div className={check.ok ? "su-check-detail mono" : "su-check-detail"}>{check.detail}</div>
        {check.fix && <div className="su-fix">{check.fix}</div>}
      </div>
    </li>
  );
}

// The preflight list (git, claude, gh signed in, codex), at the top of the first
// run and on its own from the launch notice. When something required is missing,
// each failing row says how to fix it and "Check again" re-runs the checks.
export function PreflightList() {
  const checks = useSetupStore((s) => s.checks);
  const checking = useSetupStore((s) => s.checking);
  const error = useSetupStore((s) => s.error);
  const check = useSetupStore((s) => s.check);

  const again = (
    <button type="button" className="btn" disabled={checking} onClick={() => void check()}>
      <I.Refresh size={14} />
      <BusyLabel busy={checking} idle="Check again" working="Checking…" />
    </button>
  );

  if (!checks) {
    return (
      <section className="su-checks" aria-label="Setup checks">
        <div className="su-checks-head">
          <span className="su-label">{error ? "Couldn't check your setup" : "Checking…"}</span>
          {error && again}
        </div>
        <div className="su-pending">
          {error ?? "Looking for git, Claude Code and the GitHub CLI."}
        </div>
      </section>
    );
  }

  const problems = requiredProblems(checks);
  return (
    <section className="su-checks" aria-label="Setup checks">
      <div className="su-checks-head">
        <span className="su-label">
          {problems.length === 0 ? "This computer is ready" : "Needs attention"}
        </span>
        {problems.length > 0 && again}
      </div>
      <ul className="su-check-list">
        {checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
    </section>
  );
}
