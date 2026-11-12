import { invoke } from "@tauri-apps/api/core";
import { type PreflightCheck, parseChecks } from "@/domains/setup/checks";

// Preflight (`commands/preflight.rs`): is git, claude and a signed-in gh there?
// Runs off the main thread backend-side and answers within ~12s at worst. The
// setup list's buttons install a missing CLI and start its browser sign-in.

export async function preflightChecks(): Promise<PreflightCheck[]> {
  return parseChecks(await invoke("preflight_checks"));
}

/** The CLIs trace can install and sign in itself. */
export type FixableTool = "claude" | "gh";

export function isFixableTool(id: string): id is FixableTool {
  return id === "claude" || id === "gh";
}

/** Install `tool` into `~/.local/bin`. Can take a few minutes on a slow line. */
export function preflightInstall(tool: FixableTool): Promise<void> {
  return invoke("preflight_install", { tool });
}

/** A started sign-in: for gh, the code to enter and the github.com page for it. */
export interface SignInStart {
  code: string | null;
  url: string | null;
}

/** Start `tool`'s browser sign-in; it keeps running until the browser finishes it. */
export async function preflightSignIn(tool: FixableTool): Promise<SignInStart> {
  const raw: unknown = await invoke("preflight_sign_in", { tool });
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const url = typeof r.url === "string" && r.url.startsWith("https://github.com/") ? r.url : null;
  return { code: typeof r.code === "string" ? r.code : null, url };
}

/** Stop a sign-in that's waiting on the browser. */
export function preflightCancelSignIn(tool: FixableTool): Promise<void> {
  return invoke("preflight_cancel_sign_in", { tool });
}
