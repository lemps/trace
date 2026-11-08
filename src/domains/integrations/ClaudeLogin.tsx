import { type ReactNode, useState } from "react";
import { toast } from "@/app/toast";
import { Segmented } from "@/components/Segmented";
import { useVercelStore } from "@/domains/vercel/store";
import type { ClaudeCredentialKind } from "@/ipc/vercel";

type Choice = ClaudeCredentialKind | "none";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "oauthToken", label: "OAuth token" },
  { value: "apiKey", label: "API key" },
  { value: "none", label: "None (/login)" },
];

/** What sandboxes get now, in words. Never the secret: the backend doesn't return it. */
const CURRENT: Record<Choice, string> = {
  oauthToken: "Sandboxes get your OAuth token.",
  apiKey: "Sandboxes get your API key.",
  none: "Nothing is set: each session asks you to log in with /login.",
};

const FIELD: Record<ClaudeCredentialKind, { label: string; placeholder: string; hint: ReactNode }> =
  {
    oauthToken: {
      label: "OAuth token",
      placeholder: "Paste a new OAuth token",
      hint: (
        <>
          Run <code>claude setup-token</code> and paste the token.
        </>
      ),
    },
    apiKey: {
      label: "API key",
      placeholder: "Paste a new Anthropic API key",
      hint: "An Anthropic API key, billed to its Console account.",
    },
  };

// Vercel's "Claude login in sandboxes": which login trace hands each sandbox it
// starts. Inputs are write-only; a saved secret is never shown back, only its kind.
export function ClaudeLogin() {
  const current = useVercelStore((s) => s.status?.claude ?? null);
  const setClaude = useVercelStore((s) => s.setClaude);
  const clearClaude = useVercelStore((s) => s.clearClaude);
  const [choice, setChoice] = useState<Choice>(current ?? "oauthToken");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  const run = (work: Promise<void>, done: string) => {
    setSaving(true);
    work
      .then(() => {
        setSecret("");
        toast.success(done);
      })
      .catch((err) => toast.error(`Couldn't change the Claude login: ${String(err)}`))
      .finally(() => setSaving(false));
  };
  const save = () => {
    if (choice === "none" || !secret.trim() || saving) return;
    run(setClaude(choice, secret.trim()), "Saved. New sandboxes get it.");
  };
  const switchToLogin = () => run(clearClaude(), "Cleared. Sessions log in with /login.");

  return (
    <section className="ig-sub">
      <h3>Claude login in sandboxes</h3>
      <div className="ig-note">{CURRENT[current ?? "none"]}</div>
      <Segmented label="Claude login" value={choice} options={CHOICES} onChange={setChoice} />
      {choice === "none" ? (
        current !== null && (
          <>
            <div className="ig-note">
              Forget the saved login. Each session then asks you to log in with /login.
            </div>
            <div className="ig-form-foot">
              <button type="button" className="btn" disabled={saving} onClick={switchToLogin}>
                Use /login instead
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <div className="field">
            <label htmlFor="vercel-claude-secret">{FIELD[choice].label}</label>
            <input
              id="vercel-claude-secret"
              type="password"
              autoComplete="off"
              placeholder={FIELD[choice].placeholder}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <span className="hint">{FIELD[choice].hint}</span>
          </div>
          <div className="ig-note">
            It goes into each sandbox's environment, where anyone on your Vercel team can read it.
          </div>
          <div className="ig-form-foot">
            <button
              type="button"
              className="btn primary"
              disabled={!secret.trim() || saving}
              onClick={save}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
