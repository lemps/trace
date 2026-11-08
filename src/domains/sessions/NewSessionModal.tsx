import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/app/toast";
import { Modal } from "@/components/Modal";
import { Segmented } from "@/components/Segmented";
import { defaultTransport, useHasChat } from "@/domains/agentChat/transport";
import { useVercelStatus } from "@/domains/vercel/store";
import type { AgentCli, AgentProvider, Transport } from "@/ipc/agent";
import { listRepos } from "@/ipc/repos";
import { basename } from "@/platform/paths";
import type { SessionHostKind } from "./types";

interface NewSessionModalProps {
  defaultCli: AgentCli;
  defaultProvider: AgentProvider;
  onClose: () => void;
  onCreate: (
    title: string,
    cli: AgentCli,
    repo: string | null,
    provider: AgentProvider,
    folder: string | null,
    transport: Transport,
    host: SessionHostKind | null
  ) => void;
}

// Show the repo's folder name, not its full path — matches the board's picker.
// Values of the "Runs in" picker that aren't a repo's path (those are always absolute).
const SCRATCH = "scratch";
const FOLDER = "folder";
const CHOOSE_FOLDER = "choose";
const isRepoPlace = (place: string) => place !== SCRATCH && place !== FOLDER;

/** "Run on": this computer (null) or a Vercel Sandbox. */
const HOSTS: { value: SessionHostKind | "local"; label: string }[] = [
  { value: "local", label: "This computer" },
  { value: "vercel", label: "Vercel" },
];

// Title + agent + where it runs, for a new exploratory session. Title is optional (the
// backend falls back to "Exploration" when blank). A repo gives it an isolated worktree;
// it doesn't need one, and can run in a folder of the user's or an empty scratch folder.
// With Vercel connected it can run in a Vercel Sandbox instead, which needs a repo (the
// sandbox clones its GitHub remote) and runs Claude in a terminal.
export function NewSessionModal({
  defaultCli,
  defaultProvider,
  onClose,
  onCreate,
}: NewSessionModalProps) {
  const [title, setTitle] = useState("");
  const vercel = useVercelStatus();
  const [hostPick, setHostPick] = useState<SessionHostKind | "local">("local");
  // Disconnected meanwhile: back to this computer.
  const host = vercel && hostPick === "vercel" ? "vercel" : null;
  const [pickedCli, setCli] = useState<AgentCli>(defaultCli);
  // A sandbox's image has Claude Code, not Codex.
  const cli: AgentCli = host ? "claude" : pickedCli;
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider);
  const [transport, setTransport] = useState<Transport>(() => defaultTransport(defaultCli));
  const canChat = useHasChat(cli);
  // A sandbox's agent reaches trace as a terminal only.
  // A Vercel sandbox runs Claude as a chat too (`execution::sandbox::chat`).
  const shownAs: Transport = canChat ? transport : "terminal";
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

  const runOn = (next: SessionHostKind | "local") => {
    setHostPick(next);
    // A sandbox needs a repo: move off a folder onto the first one.
    if (next === "vercel" && !isRepoPlace(place) && repos[0]) setPlace(repos[0]);
  };
  const canCreate = !host || isRepoPlace(place);

  const submit = () => {
    if (!canCreate) return;
    const isRepo = isRepoPlace(place);
    onCreate(
      title.trim() || "Exploration",
      cli,
      isRepo ? place : null,
      provider,
      place === FOLDER ? folder : null,
      shownAs,
      host
    );
  };

  const note = host
    ? repos.length === 0
      ? "A Vercel session needs a repository. Add one in Settings → Repositories."
      : "Runs in a Vercel sandbox; sessions on the Hobby plan end after 45 minutes."
    : place === SCRATCH
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
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!canCreate} onClick={submit}>
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
      {vercel && (
        <div className="field">
          <span className="field-label">Run on</span>
          <Segmented
            label="Run on"
            value={hostPick}
            options={HOSTS}
            onChange={runOn}
            className="ns-host"
          />
        </div>
      )}
      <label className="field">
        <span className="field-label">Agent</span>
        <select
          className="field-input"
          value={cli}
          disabled={Boolean(host)}
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
        <span className="field-label">Shows as</span>
        <select
          className="field-input"
          value={shownAs}
          disabled={!canChat}
          onChange={(e) => setTransport(e.target.value as Transport)}
        >
          <option value="chat">Chat</option>
          <option value="terminal">Terminal</option>
        </select>
      </label>
      {!canChat && !host && (
        <div className="field-note">
          {cli === "codex" ? "Codex" : cli} has no chat view yet, so it runs in a terminal.
        </div>
      )}
      <label className="field">
        <span className="field-label">{host ? "Repository" : "Runs in"}</span>
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
          {!host && folder && <option value={FOLDER}>{basename(folder)}</option>}
          {!host && <option value={SCRATCH}>New empty folder</option>}
          {!host && <option value={CHOOSE_FOLDER}>Choose a folder…</option>}
          {host && repos.length === 0 && <option value={place}>No repositories</option>}
        </select>
      </label>
      <div className="field-note">{note}</div>
    </Modal>
  );
}
