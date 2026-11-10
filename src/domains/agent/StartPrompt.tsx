import { I, ICON_SIZE } from "@/components/Icon";
import { basename } from "@/platform/paths";

interface StartPromptProps {
  onStart: () => void;
  onStartFresh: () => void;
  repos: string[];
  repoChoice: string;
  onRepoChange: (path: string) => void;
  /** Display name of the agent about to launch (e.g. "claude", "kimi · wafer"). */
  agentName: string;
  /** The harness CLI ("claude" | "codex") — names the TUI the user will get. */
  cliName: string;
  /** The agent exited by itself: word this as a restart of the same conversation. */
  exited?: boolean;
  /** It will start as a chat rather than its TUI. */
  asChat: boolean;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Overlay shown over the (mounted-but-idle) terminal before a session starts:
// pick the repo, then start. Disabled until at least one repo is configured.
export function StartPrompt({
  onStart,
  onStartFresh,
  repos,
  repoChoice,
  onRepoChange,
  agentName,
  cliName,
  exited = false,
  asChat,
}: StartPromptProps) {
  const noRepos = repos.length === 0;
  return (
    <div className="empty-state">
      <div className="inner">
        <span className="ic">
          <I.Play size={ICON_SIZE.empty} />
        </span>
        {exited ? (
          <>
            <div className="title">{capitalize(agentName)} exited</div>
            <div className="hint">
              Its conversation is saved. Restart to pick up where it left off.
            </div>
          </>
        ) : (
          <>
            <div className="title">
              Start {asChat ? "a" : "an interactive"} {capitalize(agentName)} session
            </div>
            <div className="hint">
              The agent runs in an isolated git worktree under the repo you pick.{" "}
              {asChat
                ? "Its work shows here as a chat: messages, tool runs, diffs and approvals."
                : `You'll get the full ${cliName} TUI right here.`}
            </div>
          </>
        )}
        {noRepos ? (
          <div className="hint" style={{ color: "var(--c-warn)" }}>
            Add a repository in Settings first.
          </div>
        ) : exited ? null : (
          <label className="field" style={{ width: 280, marginTop: 4 }}>
            <span className="field-label">Repository</span>
            <select value={repoChoice} onChange={(e) => onRepoChange(e.target.value)}>
              {repos.map((r) => (
                <option key={r} value={r}>
                  {basename(r)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn empty-action" onClick={onStart} disabled={noRepos}>
          <I.Play size={14} /> {exited ? "Restart" : "Start"} {agentName}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={onStartFresh}
          title="Forget the saved conversation and begin a new one — use this if you see “session not found”."
        >
          Start fresh conversation
        </button>
      </div>
    </div>
  );
}
