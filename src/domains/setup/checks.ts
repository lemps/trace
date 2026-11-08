// The preflight list (`preflight` in Rust): what it looks like here, reading it
// from the IPC boundary, and deciding when a later launch should say something.
// Pure, so `checks.test.ts` covers it.

/** One preflight check: a CLI trace needs, or `gh` being signed in. */
export interface PreflightCheck {
  /** "git", "claude", "gh" or "codex". */
  id: string;
  ok: boolean;
  /** Optional checks (codex) are listed but never raise the launch notice. */
  required: boolean;
  title: string;
  /** What was found (a path, a login) or what's wrong. */
  detail: string;
  /** A short plain instruction; only on a failed check. */
  fix: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** The checks in `raw`, dropping anything that isn't one. Throws if it isn't a list. */
export function parseChecks(raw: unknown): PreflightCheck[] {
  if (!Array.isArray(raw)) throw new Error("Unexpected setup checks");
  return raw.filter(isRecord).flatMap((c) => {
    if (typeof c.id !== "string" || typeof c.ok !== "boolean") return [];
    return [
      {
        id: c.id,
        ok: c.ok,
        required: c.required !== false,
        title: typeof c.title === "string" ? c.title : c.id,
        detail: typeof c.detail === "string" ? c.detail : "",
        fix: !c.ok && typeof c.fix === "string" && c.fix ? c.fix : null,
      },
    ];
  });
}

/** The required checks that failed, in list order. */
export function requiredProblems(checks: readonly PreflightCheck[]): PreflightCheck[] {
  return checks.filter((c) => c.required && !c.ok);
}

/**
 * Which required checks are failing, as one string ("" when none). Dismissing the
 * launch notice saves it, so the same problems stay quiet and a new one speaks up.
 */
export function problemKey(checks: readonly PreflightCheck[]): string {
  return requiredProblems(checks)
    .map((c) => c.id)
    .sort()
    .join(",");
}

/** Whether a later launch should raise the notice, given the key last dismissed. */
export function shouldNotify(checks: readonly PreflightCheck[], dismissed: string): boolean {
  const key = problemKey(checks);
  return key !== "" && key !== dismissed;
}

/** The notice's one line: the problem itself when there's one, else a count. */
export function noticeText(checks: readonly PreflightCheck[]): string {
  const problems = requiredProblems(checks);
  if (problems.length === 1) return `Setup: ${problems[0].title}.`;
  return `Setup: ${problems.length} things trace needs aren't ready.`;
}

/** The first run's steps, in order. Every one can be skipped with Next. */
export const SETUP_STEPS = [
  { id: "agent", label: "Agent" },
  { id: "theme", label: "Theme" },
  { id: "connect", label: "Connect" },
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number]["id"];

/** The step `by` places from `step`, held to the ends. */
export function stepBy(step: SetupStep, by: number): SetupStep {
  const at = SETUP_STEPS.findIndex((s) => s.id === step);
  const next = Math.min(SETUP_STEPS.length - 1, Math.max(0, at + by));
  return SETUP_STEPS[next].id;
}
