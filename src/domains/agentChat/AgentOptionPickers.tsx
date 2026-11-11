import { I } from "@/components/Icon";
import { ICON_SIZE } from "@/components/iconScale";
import { MenuCaret } from "@/components/MenuCaret";
import { type MenuItem, PopMenu } from "@/components/PopMenu";
import { agentCli, agentProvider } from "@/domains/agent/defaults";
import { useAgentOptionsStore, useSavedOptions } from "./agentOptions";
import {
  appliesWhen,
  effortChoices,
  effortLabel,
  effortSuffix,
  modeChoices,
  modeDetail,
  modeGlyph,
  modeLabel,
  modelChoices,
  modelEffortName,
  modelEffortText,
  modelLabel,
  modelLockReason,
  type OptionKind,
  pickerTitle,
  shownOption,
} from "./agentOptionsFormat";
import { useAgentChatStore } from "./store";

interface AgentOptionPickersProps {
  workspaceId: string;
  /** The agent is up: a pick goes to it now (or its next message), not its next start. */
  running: boolean;
}

// The composer bar's two settings, kept per workspace: one pill for the model and
// its effort ("Opus 5.5 · High"), and the permission mode (its glyph and word).
// Each shows what's in effect (what the agent reports while it runs, what its next
// start uses while it's stopped). Plan mode is marked in the brand accent so it's
// never missed; agent-state colours stay out of it. A narrow composer collapses
// them to glyphs in steps (agentOptions.css), never truncating a label.
export function AgentOptionPickers({ workspaceId, running }: AgentOptionPickersProps) {
  const info = useAgentChatStore((s) => s.info[workspaceId]);
  const saved = useSavedOptions(workspaceId);
  const pick = useAgentOptionsStore((s) => s.pick);
  const agent = info?.agent ?? agentCli();
  const settingsProvider = agentProvider();
  const provider =
    info?.provider ?? (info || settingsProvider === "anthropic" ? undefined : settingsProvider);
  const shown = (kind: OptionKind) => shownOption(kind, running, info, saved);
  const onPick = (kind: OptionKind, value: string) => pick(workspaceId, kind, value);

  return (
    <div className="ac-opts">
      <ModelEffortPicker
        agent={agent}
        model={shown("model")}
        effort={shown("effort")}
        when={appliesWhen(running, agent)}
        lock={modelLockReason(agent, provider)}
        onPick={onPick}
      />
      <ModePicker
        agent={agent}
        mode={shown("permissionMode")}
        when={appliesWhen(running, agent)}
        onPick={(value) => onPick("permissionMode", value)}
      />
    </div>
  );
}

/** A menu section's heading, with when a pick applies if not at once. */
function heading(name: string, when: string | null): string {
  return when ? `${name} · ${when.toLowerCase()}` : name;
}

interface ModelEffortPickerProps {
  agent: string;
  model: string | undefined;
  effort: string | undefined;
  /** When a pick applies, if not at once. */
  when: string | null;
  /** Why the model can't be changed here (a provider pins it); effort still can. */
  lock: string | null;
  onPick: (kind: OptionKind, value: string) => void;
}

/** "Opus 5.5 · High ▴": one control, one menu with a Model and an Effort section. */
function ModelEffortPicker({ agent, model, effort, when, lock, onPick }: ModelEffortPickerProps) {
  const text = modelEffortText(model, effort);
  const name = modelEffortName(text);
  const suffix = effortSuffix(text);
  // A pinned model is listed alone, greyed, with why: the other models don't apply.
  const models: MenuItem[] = lock
    ? [
        {
          id: "locked",
          label: text.model,
          checked: true,
          disabled: true,
          detail: lock,
          onSelect: noPick,
        },
      ]
    : modelChoices(agent, model).map((m) => ({
        id: m,
        label: modelLabel(m),
        checked: m === model,
        onSelect: () => onPick("model", m),
      }));
  const efforts: MenuItem[] = effortChoices(agent).map((e) => ({
    id: e,
    label: effortLabel(e),
    checked: e === effort,
    onSelect: () => onPick("effort", e),
  }));
  return (
    <PopMenu
      align="right"
      up
      sections={[
        { title: heading("Model", when), items: models },
        { title: heading("Effort", when), items: efforts },
      ]}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className="btn ac-opt ac-opt-model"
          onClick={toggle}
          title={pickerTitle(name, [lock, when])}
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="ac-opt-glyph">
            <I.Sliders size={ICON_SIZE.sm} />
          </span>
          <span className="ac-opt-label">
            {text.model}
            {suffix && <span className="ac-opt-effort">{suffix}</span>}
          </span>
          <span className="ac-opt-chev">
            <MenuCaret up />
          </span>
        </button>
      )}
    />
  );
}

/** A disabled item's pick: never called. */
function noPick() {}

interface ModePickerProps {
  agent: string;
  mode: string | undefined;
  when: string | null;
  onPick: (value: string) => void;
}

/** The permission mode: a glyph naming it, then its word (a raised hand, "Ask ▴"). */
function ModePicker({ agent, mode, when, onPick }: ModePickerProps) {
  const word = modeLabel(mode);
  const name = `Permission mode: ${word}`;
  const Glyph = I[modeGlyph(mode)];
  return (
    <PopMenu
      align="right"
      up
      sections={[
        {
          title: heading("Mode", when),
          items: modeChoices(agent).map((m) => ({
            id: m,
            label: modeLabel(m),
            detail: modeDetail(m),
            checked: m === mode,
            onSelect: () => onPick(m),
          })),
        },
      ]}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`btn ac-opt ac-opt-mode${mode === "plan" ? " plan" : ""}`}
          onClick={toggle}
          title={pickerTitle(name, [when])}
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="ac-opt-glyph">
            <Glyph size={ICON_SIZE.sm} />
          </span>
          <span className="ac-opt-label">{word}</span>
          <span className="ac-opt-chev">
            <MenuCaret up />
          </span>
        </button>
      )}
    />
  );
}
