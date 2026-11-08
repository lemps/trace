import { useState } from "react";
import type { ConductorPreview, ConductorPrompt } from "@/ipc/conductorImport";
import { isLongBody, PROMPT_KIND_LABEL, promptName, promptProblems } from "./conductorPromptNames";
import { type Ticks, toggled } from "./conductorSelection";

// The Conductor import's "Saved prompts" section: each repo's custom prompts as
// saved prompts the composer offers as /name. One trace already has (same text)
// is shown, unticked, and never written again.

interface ConductorPromptsProps {
  preview: ConductorPreview;
  ticks: Ticks;
  onChange: (ticks: Ticks) => void;
}

export function ConductorPrompts({ preview, ticks, onChange }: ConductorPromptsProps) {
  if (preview.prompts.length === 0) return null;
  const problems = promptProblems(preview, ticks);
  return (
    <section className="ci-section">
      <div className="ci-label">Saved prompts</div>
      <div className="ci-muted">
        Conductor's custom prompts, as saved prompts you send by typing their name after / in the
        composer. Nothing trace already has is changed.
      </div>
      {preview.prompts.map((p) => (
        <PromptRow
          key={p.key}
          prompt={p}
          checked={ticks.prompts.has(p.key)}
          name={promptName(p.key, p.name, ticks)}
          problem={problems[p.key] ?? null}
          onToggle={(on) => onChange({ ...ticks, prompts: toggled(ticks.prompts, p.key, on) })}
          onName={(name) =>
            onChange({ ...ticks, promptNames: { ...ticks.promptNames, [p.key]: name } })
          }
        />
      ))}
    </section>
  );
}

interface PromptRowProps {
  prompt: ConductorPrompt;
  checked: boolean;
  name: string;
  problem: string | null;
  onToggle: (on: boolean) => void;
  onName: (name: string) => void;
}

function PromptRow({ prompt, checked, name, problem, onToggle, onName }: PromptRowProps) {
  const [expanded, setExpanded] = useState(false);
  const already = prompt.existing !== null;
  const long = isLongBody(prompt.body);
  const inputId = `ci-prompt-${prompt.key}`;
  return (
    <div className="ci-repo">
      <div className="ci-repo-head">
        <label className={already ? "ci-row off" : "ci-row"}>
          <input
            type="checkbox"
            checked={!already && checked}
            disabled={already}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="ci-row-text">
            <span className="ci-row-title">
              {prompt.title}
              <span className="ci-badge">{PROMPT_KIND_LABEL[prompt.kind]}</span>
              {already && <span className="ci-badge">Already saved as /{prompt.existing}</span>}
            </span>
            <span className="ci-row-sub">
              {prompt.repos.length > 1
                ? `The same in ${prompt.repos.join(", ")}`
                : `From ${prompt.repos.join(", ")}`}
            </span>
          </span>
        </label>
      </div>
      <div className="ci-prompt-detail">
        {!already && (
          <div className="ci-prompt-name">
            <label htmlFor={inputId}>Name</label>
            <span className={problem ? "ci-prompt-input invalid" : "ci-prompt-input"}>
              <span aria-hidden="true">/</span>
              <input
                id={inputId}
                type="text"
                spellCheck={false}
                value={name}
                aria-invalid={problem !== null}
                onChange={(e) => onName(e.target.value)}
              />
            </span>
          </div>
        )}
        {problem && <div className="ci-prompt-problem">{problem}</div>}
        {!already && !problem && prompt.takenName && name === prompt.name && (
          <div className="ci-row-note">
            trace already has a different /{prompt.takenName}, so this one is /{prompt.name}.
          </div>
        )}
        {prompt.kind === "general" && (
          <div className="ci-row-note">
            Conductor added this to every chat in {prompt.repos.join(", ")}. trace doesn't, so it's
            a prompt you send when you want it.
          </div>
        )}
        <p className={expanded ? "ci-prompt-body open" : "ci-prompt-body"}>{prompt.body}</p>
        {long && (
          <button
            type="button"
            className="rp-setup-toggle ci-prompt-more"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>
    </div>
  );
}
