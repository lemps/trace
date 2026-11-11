import {
  type OrchBackend,
  type OrchSpeed,
  useOrchestratorStore,
} from "@/domains/orchestrator/store";
import { getAnthropicKey, setAnthropicKey } from "@/ipc/orchestrator";
import { useHint } from "@/platform/shortcuts";
import { KeyField } from "./KeyField";
import { SettingRow } from "./SettingRow";
import { SettingSection } from "./SettingSection";

/** Whether an Anthropic key is saved; the key itself stays Rust-side. */
const hasAnthropicKey = async () => Boolean(await getAnthropicKey());

/** One hint for both choices, so changing the backend never re-wraps the row. */
const BACKEND_HINT =
  "SDK uses your API key and works in a multi-step tool loop. CLI (-p) uses your logged-in Claude CLI, no key, and answers one-shot from the board snapshot. Both chat and act, each action behind a confirm card.";

// Orchestrator (⌘J) backend: the Anthropic SDK (your API key, full chat +
// actions) or the Claude CLI in print mode (logged-in CLI). The key is stored
// 0600 on the Rust side and never echoed back — a saved key shows as a masked
// placeholder. The key row stays with the CLI chosen, inactive, so nothing jumps.
export function AssistantSettings() {
  const orchestratorHint = useHint("orchestrator");
  const backend = useOrchestratorStore((s) => s.backend);
  const setBackend = useOrchestratorStore((s) => s.setBackend);
  const speed = useOrchestratorStore((s) => s.speed);
  const setSpeed = useOrchestratorStore((s) => s.setSpeed);

  return (
    <SettingSection
      title="Orchestrator"
      desc={`The Orchestrator (${orchestratorHint}) talks to Claude either through the Anthropic API (your key) or your logged-in Claude CLI. The rail's buddy uses the same connection.`}
    >
      <SettingRow label="Backend" hint={BACKEND_HINT}>
        <select
          aria-label="Assistant backend"
          value={backend}
          onChange={(e) => setBackend(e.target.value as OrchBackend)}
        >
          <option value="sdk">Anthropic API key (SDK)</option>
          <option value="cli">Claude CLI (-p mode)</option>
        </select>
      </SettingRow>
      <SettingRow
        label="Speed"
        hint="Fast (Sonnet, no extended thinking) is snappy; Thorough (Opus + thinking) reasons harder."
      >
        <select
          aria-label="Assistant speed"
          value={speed}
          onChange={(e) => setSpeed(e.target.value as OrchSpeed)}
        >
          <option value="fast">Fast (Sonnet)</option>
          <option value="thorough">Thorough (Opus)</option>
        </select>
      </SettingRow>
      <KeyField
        label="Anthropic API key"
        needHint="Required to use the Orchestrator chat."
        placeholder="sk-ant-…"
        removeMessage="Remove the saved key? The Orchestrator needs one to chat."
        isSaved={hasAnthropicKey}
        save={setAnthropicKey}
        inactive={backend !== "sdk"}
        inactiveReason="Applies when Backend is the Anthropic API key."
      />
    </SettingSection>
  );
}
