import type { VercelStatus } from "../../ipc/vercel.ts";
import type { GitHubStatus } from "../github/types.ts";

// What a Vercel Sandbox session needs before it can do its job, as the Vercel
// dialog's checklist shows it: the Vercel token, a Claude login for sandboxes,
// and a GitHub account to clone and push with. Pure (relative `.ts` imports) so
// `npm test` can run it.

export interface ReadinessRow {
  id: "vercel" | "claude" | "github";
  /** null = still checking. */
  ok: boolean | null;
  label: string;
  /** How to fix a missing one; null when it's fine. */
  fix: string | null;
}

const CLAUDE_KIND = { oauthToken: "OAuth token", apiKey: "API key" } as const;

function vercelRow(vercel: VercelStatus | null): ReadinessRow {
  return vercel
    ? { id: "vercel", ok: true, label: `Vercel token saved (${vercel.user})`, fix: null }
    : {
        id: "vercel",
        ok: false,
        label: "No Vercel token",
        fix: "Paste one below. Create it under Account Settings → Tokens on vercel.com.",
      };
}

function claudeRow(vercel: VercelStatus | null): ReadinessRow {
  if (vercel?.claude) {
    const kind = CLAUDE_KIND[vercel.claude];
    return {
      id: "claude",
      ok: true,
      label: `Claude login saved for sandboxes (${kind})`,
      fix: null,
    };
  }
  return {
    id: "claude",
    ok: false,
    label: "No Claude login for sandboxes",
    fix: vercel
      ? "Sessions run in a terminal and need /login each time, with no chat. Save an OAuth token below."
      : "Connect Vercel first, then save an OAuth token here.",
  };
}

/** A token can push when it has the `repo` scope; fine-grained tokens list none. */
function canPush(scopes: string[] | null): boolean {
  return scopes === null || scopes.includes("repo") || scopes.includes("public_repo");
}

function githubRow(github: GitHubStatus | null): ReadinessRow {
  if (!github) return { id: "github", ok: null, label: "Checking GitHub…", fix: null };
  const working = github.accounts.filter((a) => !a.problem);
  if (github.accounts.length === 0) {
    return {
      id: "github",
      ok: false,
      label: "No GitHub account in trace",
      fix: "Sign in under Integrations → GitHub. A sandbox clones and pushes as one of trace's accounts.",
    };
  }
  if (working.length === 0) {
    return {
      id: "github",
      ok: false,
      label: "GitHub sign-in isn't working",
      fix: `${github.accounts[0]?.problem ?? "Its token was refused."} Renew it under Integrations → GitHub.`,
    };
  }
  if (github.login && !github.problem && !canPush(github.scopes)) {
    return {
      id: "github",
      ok: false,
      label: `${github.login}'s token can't push`,
      fix: "It lacks the repo scope. Sign in again under Integrations → GitHub with a token that has it.",
    };
  }
  const more = working.length > 1 ? ` and ${working.length - 1} more` : "";
  return {
    id: "github",
    ok: true,
    label: `GitHub: ${working[0]?.login}${more}, picked per repo to push`,
    fix: null,
  };
}

/** The checklist, in the order a new user sets things up. */
export function readiness(
  vercel: VercelStatus | null,
  github: GitHubStatus | null
): ReadinessRow[] {
  return [vercelRow(vercel), claudeRow(vercel), githubRow(github)];
}
