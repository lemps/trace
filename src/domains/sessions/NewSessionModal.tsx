import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { Modal } from "@/components/Modal";
import type { AgentCli, AgentProvider } from "@/ipc/agent";
import { listRepos } from "@/ipc/repos";
import { basename } from "@/platform/paths";

interface NewSessionModalProps {
  defaultCli: AgentCli;
  defaultProvider: AgentProvider;
  onClose: () => void;
  onCreate: (
    title: string,
    cli: AgentCli,
    repo: string | null,
    provider: AgentProvider,
    folder: string | null
  ) => void;
}

// Show the repo's folder name, not its full path — matches the board's picker.
// Values of the "Runs in" picker that aren't a repo's path (those are always absolute).
const SCRATCH = "scratch";
const FOLDER = "folder";
const CHOOSE_FOLDER = "choose";

// Title + agent + where it runs, for a new exploratory session. Title is optional (the
// backend falls back to "Exploration" when blank). A repo gives it an isolated worktree;
// it doesn't need one, and can run in a folder of the user's or an empty scratch folder.
export function NewSessionModal({
  defaultCli,
  defaultProvider,
  onClose,
  onCreate,
}: NewSessionModalProps) {
  const [title, setTitle] = useState("");
  const [cli, setCli] = useState<AgentCli>(defaultCli);
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider);
  const [repos, setRepos] = useState<string[]>([]);
  const [place, setPlace] = useState(SCRATCH);
  const [folder, setFolder] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the title field on open (without the lint-flagged autoFocus attribute).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load configured repos and default the picker to the first one.
  useEffect(() => {
    let cancelled = false;
    listRepos()
      .then((all) => {
        if (cancelled) return;
        setRepos(all);
        if (all[0]) setPlace(all[0]);
      })
      .catch((err) => toast.error(`Couldn't load your repositories: ${String(err)}`));
    return () => {
      cancelled = true;
    };
  }, []);

  const choosePlace = async (next: string) => {
    if (next !== CHOOSE_FOLDER) {
      setPlace(next);
      return;
    }
    // A cancelled dialog leaves the current choice alone.
    const picked = await open({ directory: true, multiple: false, title: "Choose a folder" });
    if (typeof picked !== "string") return;
    setFolder(picked);
    setPlace(FOLDER);
  };

  const submit = () => {
    const isRepo = place !== SCRATCH && place !== FOLDER;
    onCreate(
      title.trim() || "Exploration",
      cli,
      isRepo ? place : null,
      provider,
      place === FOLDER ? folder : null
    );
  };

  const note =
    place === SCRATCH
      ? "Runs in a new empty folder, which is deleted along with the session."
      : place === FOLDER
        ? "Runs directly in this folder. Without a worktree, there's no isolation or Files tab."
        : "Runs in an isolated worktree of the selected repository.";

  return (
    <Modal
      title="New session"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={submit}>
            Create
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">What are you exploring?</span>
        <input
          ref={inputRef}
          className="field-input"
          type="text"
          placeholder="e.g. Spike: try the new parser"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </label>
      <label className="field">
        <span className="field-label">Agent</span>
        <select
          className="field-input"
          value={cli}
          onChange={(e) => setCli(e.target.value as AgentCli)}
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </label>
      {cli === "claude" && (
        <label className="field">
          <span className="field-label">Provider</span>
          <select
            className="field-input"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AgentProvider)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="moonshot">Kimi (Moonshot)</option>
            <option value="wafer">Kimi (Wafer)</option>
            <option value="wafer-fast">Kimi Fast (Wafer)</option>
            <option value="deepseek">DeepSeek Flash</option>
            <option value="deepseek-pro">DeepSeek Pro</option>
          </select>
        </label>
      )}
      <label className="field">
        <span className="field-label">Runs in</span>
        <select
          className="field-input"
          value={place}
          onChange={(e) => void choosePlace(e.target.value)}
        >
          {repos.map((r) => (
            <option key={r} value={r}>
              {basename(r)}
            </option>
          ))}
          {folder && <option value={FOLDER}>{basename(folder)}</option>}
          <option value={SCRATCH}>New empty folder</option>
          <option value={CHOOSE_FOLDER}>Choose a folder…</option>
        </select>
      </label>
      <div className="field-note">{note}</div>
    </Modal>
  );
}
