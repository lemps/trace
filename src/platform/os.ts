// The one place the UI learns which OS it's on. Everything else asks a question of
// this folder (which keys, which sounds) rather than checking the OS itself.

export type Os = "macos" | "windows" | "linux";

export function detectOs(userAgent: string): Os {
  if (userAgent.includes("Mac")) return "macos";
  if (userAgent.includes("Windows")) return "windows";
  return "linux";
}

export const currentOs: Os = detectOs(navigator.userAgent);
