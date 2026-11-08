import { useEffect } from "react";
import { I } from "@/components/Icon";
import { useGitHubStore } from "@/domains/github/store";
import { readiness } from "@/domains/vercel/readiness";
import type { VercelStatus } from "@/ipc/vercel";

// The Vercel dialog's checklist: what a sandbox session needs (the Vercel token, a
// Claude login for sandboxes, a GitHub account that can push), each ticked or
// crossed, and how to fix a crossed one. Connected-or-not isn't agent state, so
// it's the tracker's green and the danger red, like the Integrations cards.
export function VercelReadiness({ vercel }: { vercel: VercelStatus | null }) {
  const github = useGitHubStore((s) => s.status);
  const checkGitHub = useGitHubStore((s) => s.checkStatus);
  useEffect(() => {
    if (!github) void checkGitHub();
  }, [github, checkGitHub]);
  const rows = readiness(vercel, github);
  return (
    <section className="ig-sub">
      <h3>Ready for sandbox sessions</h3>
      <ul className="ig-ready">
        {rows.map((r) => (
          <li key={r.id} className={`ig-ready-row ${stateClass(r.ok)}`}>
            <span className="ig-ready-ic" role="img" aria-label={word(r.ok)}>
              {r.ok === null ? (
                <I.Clock size={13} />
              ) : r.ok ? (
                <I.Check size={13} />
              ) : (
                <I.X size={13} />
              )}
            </span>
            <span className="ig-ready-text">
              <span className="ig-ready-label">{r.label}</span>
              {r.fix && <span className="ig-ready-fix">{r.fix}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const stateClass = (ok: boolean | null) => (ok === null ? "checking" : ok ? "ok" : "missing");
const word = (ok: boolean | null) => (ok === null ? "Checking" : ok ? "Done" : "Missing");
