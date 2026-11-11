import type { AgentProvider } from "@/ipc/agent";
import {
  deepseekKeyConfigured,
  moonshotKeyConfigured,
  setDeepseekKey,
  setMoonshotKey,
  setWaferKey,
  waferKeyConfigured,
} from "@/ipc/providers";
import { KeyField } from "./KeyField";

// The masked API-key field for a third-party model provider. The key is stored
// 0600 Rust-side and never read back — the UI only learns whether one exists.
// Normal/fast variants of the same endpoint share one credential. With Anthropic
// (or Codex) chosen, the row stays in place, inactive, so the page doesn't move.

interface ProviderKeyFieldProps {
  provider: AgentProvider;
  /** Why the key doesn't apply now (Codex chosen, or Anthropic); none: it does. */
  inactiveReason?: string;
}

/** Credential family — Wafer/DeepSeek normal+fast/flash share one key file each. */
type CredFamily = "moonshot" | "wafer" | "deepseek";

function credFamily(provider: Exclude<AgentProvider, "anthropic">): CredFamily {
  if (provider === "wafer" || provider === "wafer-fast") return "wafer";
  if (provider === "deepseek" || provider === "deepseek-pro") return "deepseek";
  return "moonshot";
}

const META: Record<CredFamily, { label: string; origin: string }> = {
  moonshot: { label: "Moonshot API key", origin: "platform.moonshot.ai" },
  wafer: { label: "Wafer API key", origin: "app.wafer.ai" },
  deepseek: { label: "DeepSeek API key", origin: "platform.deepseek.com" },
};

const CHECK: Record<CredFamily, () => Promise<boolean>> = {
  moonshot: moonshotKeyConfigured,
  wafer: waferKeyConfigured,
  deepseek: deepseekKeyConfigured,
};

const SAVE: Record<CredFamily, (key: string) => Promise<void>> = {
  moonshot: setMoonshotKey,
  wafer: setWaferKey,
  deepseek: setDeepseekKey,
};

/** Anthropic needs no key here: the row shows, inactive, with nothing to check. */
const NO_KEY = async () => false;
const NO_SAVE = async () => {};

export function ProviderKeyField({ provider, inactiveReason }: ProviderKeyFieldProps) {
  if (provider === "anthropic") {
    return (
      <KeyField
        label="Provider API key"
        needHint="Needed by a third-party provider, from its own site."
        placeholder="Paste a key"
        removeMessage="Remove the saved key?"
        isSaved={NO_KEY}
        save={NO_SAVE}
        inactive
        inactiveReason={inactiveReason ?? "Applies when Provider isn't Anthropic."}
      />
    );
  }
  const family = credFamily(provider);
  const meta = META[family];
  return (
    <KeyField
      key={family}
      label={meta.label}
      needHint={`Required for agents via this provider — from ${meta.origin}.`}
      placeholder="Paste a key"
      removeMessage="Remove the saved key? Agents on this provider need one."
      isSaved={CHECK[family]}
      save={SAVE[family]}
      inactive={inactiveReason !== undefined}
      inactiveReason={inactiveReason}
    />
  );
}
