import { LIGHT_LABEL } from "@/domains/live/light";
import { QUIET_AFTER_MS, QUIET_LABEL } from "@/domains/live/quiet";
import type { AgentLight } from "@/domains/live/types";

interface StatusLightProps {
  light: AgentLight;
  /**
   * `dot` — the light alone (tabs, Recents); `word` — dot + label (list rows);
   * `pill` — a tinted pill (cards, headers, inbox).
   */
  variant?: "dot" | "word" | "pill";
  /** Overrides the state word — what the agent asks for, e.g. "Permission · Bash". */
  label?: string;
  /** How long it's been like this ("6m"), shown after the label. */
  age?: string;
  /** Tooltip — e.g. a per-agent breakdown; the label otherwise. */
  title?: string;
  /** `lg`: header size — the same height and corners as the buttons beside it. */
  size?: "sm" | "lg";
  /**
   * A working agent trace hasn't heard from in a while (`live/quietStore`): drawn
   * as a still dashed ring saying "No recent update" rather than a spinner that
   * may be stale. Only changes how `working` looks; ignored for other lights.
   */
  quiet?: boolean;
}

/** The quiet look's tooltip: the why behind the word. */
const QUIET_WHY = `${QUIET_LABEL}: still working, but nothing heard from it for ${QUIET_AFTER_MS / 60_000}+ minutes`;

/**
 * An agent's state, the same everywhere: blinking amber needs you, blue
 * spinner working, green ready, hollow grey stopped (see `--state-*` tokens).
 * A quiet working agent is a still, dashed grey ring: a fifth look, not a
 * fifth state.
 */
export function StatusLight({
  light,
  variant = "dot",
  label,
  age,
  title,
  size = "sm",
  quiet = false,
}: StatusLightProps) {
  const isQuiet = quiet && light === "working";
  const look = isQuiet ? "quiet" : light;
  const text = isQuiet ? QUIET_LABEL : (label ?? LIGHT_LABEL[light]);
  const tip = title ?? (isQuiet ? QUIET_WHY : age ? `${text} · ${age}` : text);
  const dot = <span className={`light-dot ${look}`} aria-hidden={variant !== "dot"} />;
  if (variant === "dot") {
    return <span className={`light-dot ${look}`} title={tip} role="img" aria-label={tip} />;
  }
  return (
    <span className={`light-${variant} ${look}${size === "lg" ? " lg" : ""}`} title={tip}>
      {dot}
      <span className="light-text">{text}</span>
      {age && <span className="light-age">{age}</span>}
    </span>
  );
}
