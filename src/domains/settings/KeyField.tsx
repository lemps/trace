import { useEffect, useState } from "react";
import { toast } from "@/app/toast";
import { BusyLabel } from "@/components/BusyLabel";
import { InlineConfirm } from "@/components/InlineConfirm";
import { SettingRow } from "./SettingRow";

interface KeyFieldProps {
  /** "Anthropic API key", "Wafer API key". */
  label: string;
  /** The hint while no key is saved: what needs one, and where to get it. */
  needHint: string;
  /** The empty field's placeholder while no key is saved ("sk-ant-…"). */
  placeholder: string;
  /** The remove confirm's sentence: what stops working without it. */
  removeMessage: string;
  /** Whether a key is saved. Keys never come back to the renderer, only this. */
  isSaved: () => Promise<boolean>;
  /** Saves the key, or removes it given "". */
  save: (key: string) => Promise<void>;
  inactive?: boolean;
  inactiveReason?: string;
}

type Phase = "idle" | "saving" | "saved";

/** How long Save reads "Saved" after a key is stored. */
const SAVED_MS = 2000;

/**
 * A masked API-key field as a full-width settings row: the key, Save (Save /
 * Saving… / Saved, all in its own reserved width) and a quiet Remove. The Remove
 * line keeps its place while there's no key, so saving the first one doesn't move
 * the page. Errors are toasts with the reason.
 */
export function KeyField(props: KeyFieldProps) {
  const { label, isSaved, save } = props;
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    let live = true;
    isSaved()
      .then((has) => live && setSaved(has))
      .catch((err) => {
        if (!live) return;
        setSaved(false);
        toast.error(`Couldn't check for a saved ${label.toLowerCase()}: ${String(err)}`);
      });
    return () => {
      live = false;
    };
  }, [isSaved, label]);

  useEffect(() => {
    if (phase !== "saved") return;
    const t = setTimeout(() => setPhase("idle"), SAVED_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const store = async (next: string) => {
    setPhase("saving");
    try {
      await save(next);
      setSaved(Boolean(next.trim()));
      setDraft("");
      setPhase(next.trim() ? "saved" : "idle");
    } catch (err) {
      toast.error(
        `Couldn't ${next.trim() ? "save" : "remove"} the ${label.toLowerCase()}: ${String(err)}`
      );
      setPhase("idle");
    }
  };

  return (
    <SettingRow
      label={label}
      hint={saved ? "A key is saved. Enter a new one to replace it." : props.needHint}
      inactive={props.inactive}
      inactiveReason={props.inactiveReason}
      block
    >
      <form
        className="key-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && phase !== "saving") void store(draft);
        }}
      >
        <input
          type="password"
          className="key-input"
          aria-label={label}
          placeholder={saved ? "•••••••••••••••• (saved)" : props.placeholder}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (phase === "saved") setPhase("idle");
          }}
        />
        <button type="submit" className="btn" disabled={!draft.trim() || phase === "saving"}>
          <BusyLabel
            busy={phase === "saving"}
            idle={<BusyLabel busy={phase === "saved"} idle="Save" working="Saved" />}
            working="Saving…"
          />
        </button>
      </form>
      <div className="key-remove-row" aria-hidden={!saved || undefined}>
        <InlineConfirm
          label="Remove key"
          className="link-btn"
          size="xs"
          disabled={!saved || phase === "saving"}
          message={props.removeMessage}
          confirmLabel="Remove"
          onConfirm={() => void store("")}
        />
      </div>
    </SettingRow>
  );
}
