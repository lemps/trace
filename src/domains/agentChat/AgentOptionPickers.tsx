import { MenuCaret } from "@/components/MenuCaret";
import { type MenuItem, PopMenu } from "@/components/PopMenu";
import { agentCli, agentProvider } from "@/domains/agent/defaults";
import { useAgentOptionsStore, useSavedOptions } from "./agentOptions";
import {
  appliesWhen,
  effortChoices,
  effortLabel,
  modeChoices,
  modeDetail,
  modeLabel,
  modelChoices,
  modelLabel,
  modelLockReason,
  type OptionKind,
  shownOption,
} from "./agentOptionsFormat";
import { useAgentChatStore } from "./store";

interface AgentOptionPickersProps {
  workspaceId: string;
  /** The agent is up: a pick goes to it now (or its next message), not its next start. */
  running: boolean;
}

// The composer bar's model, effort and permission-mode pickers, kept per
// workspace. Each shows what's in effect (what the agent reports while it runs,
// what its next start uses while it's stopped). Plan mode is marked in the
// brand accent so it's never missed; agent-state colours stay out of it.
export function AgentOptionPickers({ workspaceId, running }: AgentOptionPickersProps) {
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  const saved = useSavedOptions(workspaceId);
  const pick = useAgentOptionsStore((s) => s.pick);
  const agent = info?.agent ?? agentCli();
  const settingsProvider = agentProvider();
  const provider =
    info?.provider ?? (info || settingsProvider === "anthropic" ? undefined : settingsProvider);
  const when = appliesWhen(running, agent);
  const shown = (kind: OptionKind) => shownOption(kind, running, info, saved);
  const choose = (kind: OptionKind) => (value: string) => pick(workspaceId, kind, value);

  const model = shown("model");
  const effort = shown("effort");
  const mode = shown("permissionMode");
  const lock = modelLockReason(agent, provider);

  return (
    <div className="ac-opts">
      <Picker
        name="Model"
        label={modelLabel(model)}
        when={when}
        lock={lock}
        items={modelChoices(agent, model).map((m) => ({
          id: m,
          label: modelLabel(m),
          checked: m === model,
          onSelect: () => choose("model")(m),
        }))}
      />
      <Picker
        name="Effort"
        label={effortLabel(effort)}
        when={when}
        items={effortChoices(agent).map((e) => ({
          id: e,
          label: effortLabel(e),
          checked: e === effort,
          onSelect: () => choose("effort")(e),
        }))}
      />
      <Picker
        name="Mode"
        label={modeLabel(mode)}
        when={when}
        tone={mode === "plan" ? "plan" : undefined}
        items={modeChoices(agent).map((m) => ({
          id: m,
          label: modeLabel(m),
          detail: modeDetail(m),
          checked: m === mode,
          onSelect: () => choose("permissionMode")(m),
        }))}
      />
    </div>
  );
}

interface PickerProps {
  /** What it picks, for its tooltip and the menu's heading. */
  name: string;
  label: string;
  items: MenuItem[];
  /** When a pick applies, if not at once. */
  when: string | null;
  /** Why it can't be changed here. */
  lock?: string | null;
  tone?: "plan";
}

function Picker({ name, label, items, when, lock, tone }: PickerProps) {
  const title = lock ? `${name}: ${label}. ${lock}` : `${name}: ${label}${when ? `. ${when}` : ""}`;
  return (
    <PopMenu
      align="right"
      sections={[{ title: when ? `${name} · ${when.toLowerCase()}` : name, items }]}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`ac-opt${tone ? ` ${tone}` : ""}`}
          onClick={toggle}
          disabled={Boolean(lock)}
          title={title}
          aria-label={`${name}: ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="ac-opt-label">{label}</span>
          <span className="ac-opt-chev" aria-hidden>
            <MenuCaret size="xs" up />
          </span>
        </button>
      )}
    />
  );
}
