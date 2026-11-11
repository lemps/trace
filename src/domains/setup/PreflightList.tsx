import { BusyLabel } from "@/components/BusyLabel";
import { I } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { useCopied } from "@/components/markdown/useCopied";
import { copyPlain } from "@/ipc/clipboard";
import { type FixAction, type PreflightCheck, requiredProblems } from "./checks";
import { type SignInPrompt, useFixStore } from "./fixes";
import { useSetupStore } from "./store";

const WORDS: Record<FixAction, { idle: string; working: string }> = {
  install: { idle: "Install", working: "Installing…" },
  signIn: { idle: "Sign in", working: "Signing in…" },
};

// A sign-in waiting on the browser. gh's code is already on the clipboard and its
// page already open; this is for when the browser landed somewhere else.
function SignInPanel({ prompt }: { prompt: SignInPrompt }) {
  const cancel = useFixStore((s) => s.cancel);
  const [copied, flash] = useCopied();
  const code = prompt.code;
  return (
    <div className="su-signin">
      {code ? (
        <>
          <div>Paste this code on the GitHub page that just opened (it's copied):</div>
          <div className="su-signin-code">
            <span className="mono">{code}</span>
            <IconButton
              size="xs"
              label={copied ? "Copied" : "Copy code"}
              onClick={() => void copyPlain(code).then(flash)}
            >
              {copied ? <I.Check size={12} /> : <I.Copy size={12} />}
            </IconButton>
          </div>
        </>
      ) : (
        <div>Finish signing in in the browser window that just opened.</div>
      )}
      <div className="su-signin-actions">
        <span className="su-signin-wait">Waiting for the browser…</span>
        <button type="button" className="btn xs" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CheckRow({ check }: { check: PreflightCheck }) {
  const running = useFixStore((s) => s.running);
  const prompt = useFixStore((s) => s.prompt);
  const error = useFixStore((s) => s.errors[check.id]);
  const fix = useFixStore((s) => s.fix);
  const tone = check.ok ? "ok" : check.required ? "bad" : "optional";
  const action = check.ok ? null : check.action;
  const isMine = running?.id === check.id;
  // A button does it for them; the terminal line is the fallback when it fails.
  const showHint = check.fix && (!action || error);
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
        {error && <div className="su-fix-error">{error}</div>}
        {showHint && <div className="su-fix">{check.fix}</div>}
        {isMine && prompt && <SignInPanel prompt={prompt} />}
      </div>
      {action && (
        <button
          type="button"
          className="btn sm su-check-action"
          disabled={running !== null}
          onClick={() => void fix(check.id, action)}
        >
          <BusyLabel busy={isMine} idle={WORDS[action].idle} working={WORDS[action].working} />
        </button>
      )}
    </li>
  );
}

// The preflight list (git, claude signed in, gh signed in, codex), at the top of
// the first run and on its own from the launch notice. A row trace can fix itself
// has a button for it, and "Set it all up" runs them all; the rest say how to fix
// them by hand, and "Check again" re-runs the checks.
export function PreflightList() {
  const checks = useSetupStore((s) => s.checks);
  const checking = useSetupStore((s) => s.checking);
  const error = useSetupStore((s) => s.error);
  const check = useSetupStore((s) => s.check);
  const running = useFixStore((s) => s.running);
  const fixAll = useFixStore((s) => s.fixAll);

  const again = (
    <button
      type="button"
      className="btn"
      disabled={checking || running !== null}
      onClick={() => void check()}
    >
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
  const fixable = problems.filter((c) => c.action !== null).length;
  return (
    <section className="su-checks" aria-label="Setup checks">
      <div className="su-checks-head">
        <span className="su-label">
          {problems.length === 0 ? "This computer is ready" : "Needs attention"}
        </span>
        {problems.length > 0 && (
          <span className="su-checks-buttons">
            {fixable > 1 && (
              <button
                type="button"
                className="btn"
                disabled={running !== null}
                onClick={() => void fixAll()}
              >
                Set it all up
              </button>
            )}
            {again}
          </span>
        )}
      </div>
      <ul className="su-check-list">
        {checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>
    </section>
  );
}
