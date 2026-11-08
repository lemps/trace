import { invoke } from "@tauri-apps/api/core";
import { type PreflightCheck, parseChecks } from "@/domains/setup/checks";

// Preflight (`commands/preflight.rs`): is git, claude and a signed-in gh there?
// Runs off the main thread backend-side and answers within ~12s at worst.

export async function preflightChecks(): Promise<PreflightCheck[]> {
  return parseChecks(await invoke("preflight_checks"));
}
